/// <reference types="node" />
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { appendMonemyRows, parseMonemyCsv, planMonemyImport, type MonemyRow } from './monemyImport';
import { createFinanceStoreHook, type ReactHooks } from '../store/finance';
import type { FinanceState } from '../types/finance';
const header = '日付,区分,項目,収入金額,支出金額,内容,メモ';
const expense = '2026-11-20,支出,食費,,1234.0,昼食,メモ';
const income = '2026-11-19,収入,給与,5000.0,,,給与メモ';
const sha256 = (text: string) => createHash('sha256').update(text, 'utf16le').digest('hex');
const parseCsv = (text: string) => parseMonemyCsv(text, sha256);
const parse = (body: string) => parseCsv(`${header}\n${body}`);
const append = (data: FinanceState, rows: MonemyRow[], accountId: string) => {
  const plan = planMonemyImport(data, rows, accountId);
  return { ...plan, state: appendMonemyRows(plan) };
};
const state = (): FinanceState => ({ accounts: [{ id: 'cash', name: '財布', type: 'cash', initialBalance: 500 }], transactions: [], budgets: [], recurringItems: [], savingsGoals: [] });
describe('Monemy CSV', () => {
  it('parses BOM, CRLF, integer-looking decimals and preserves notes', () => {
    const rows = parseCsv(`\uFEFF${header}\r\n${expense}\r\n${income}\r\n`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ amount: 1234, date: '2026-11-20', title: '昼食', memo: 'メモ' });
    const result = append(state(), rows, 'cash');
    expect(result).toMatchObject({ added: 2, income: 5000, expense: 1234 });
    expect(result.state.transactions[1].title).toBe('給与');
    expect(result.state.accounts[0].initialBalance).toBe(500);
  });
  it('handles quoted commas, doubled quotes and multiline notes', () => {
    expect(parse('2026-11-20,支出,食費,,1,"a,b","line1\n""line2"""')[0]).toMatchObject({ title: 'a,b', memo: 'line1\n"line2"' });
  });
  it('keeps identical legitimate rows but skips exact reimport', () => {
    const rows = parse(`${expense}\n${expense}`);
    expect(rows).toHaveLength(2);
    expect(rows[0].fingerprint).not.toBe(rows[1].fingerprint);
    const first = append(state(), rows, 'cash');
    expect(first.added).toBe(2);
    const tx = first.state.transactions[0];
    expect(tx.id).toMatch(/^tx_monemy_\d+_[a-z0-9]+_0$/);
    expect(tx.monemySource?.fingerprint).toMatch(/^[a-f0-9]{64}:1$/);
    expect(tx.memo).toBe('メモ');
    const second = append(first.state, rows, 'cash');
    expect(second.added).toBe(0);
    expect(second.duplicates).toBe(2);
    expect(second.state.transactions).toHaveLength(2);
    expect(second.state.customCategories).toHaveLength(1);
  });
  it('recognizes a reimport from the earlier draft and does not renumber its transaction', () => {
    const old = [ '2026-11-20', 'expense', '食費', 1234, '昼食', 'メモ' ];
    const data = state();
    const tx = { id: `tx_monemy_${encodeURIComponent(JSON.stringify(old))}_1_cash`,
      type: 'expense' as const, date: '2026-11-20', categoryId: 'food', accountId: 'cash', amount: 1234, title: '昼食' };
    data.transactions.push(tx);
    const plan = planMonemyImport(data, parse(expense), 'cash');
    expect(plan).toMatchObject({ added: 0, duplicates: 1 });
    expect(appendMonemyRows(plan)).toBe(data);
    expect(data.transactions[0].id).toBe(tx.id);
  });
  it('appends without modifying existing data, budgets or opening balances', () => {
    const s = state();
    s.budgets.push({ categoryId: 'food', monthlyLimit: 5000 });
    const first = append(s, parse(expense), 'cash');
    const second = append(first.state, parse(`${income}\n${expense}`), 'cash');
    expect(second.added).toBe(1);
    expect(second.duplicates).toBe(1);
    expect(second.state.transactions).toHaveLength(2);
    expect(s.transactions).toHaveLength(0);
    expect(second.state.budgets).toEqual(s.budgets);
  });
  it.each([
    expense.replace('1234.0', '1.5'), expense.replace('1234.0', '-1'), expense.replace('1234.0', '1e3'),
    expense.replace('1234.0', '9007199254740992'), expense.replace('2026-11-20', '2026-02-30'),
    expense.replace('支出', '振替'), expense.replace(',,1234', ',1,1234'), expense + ',extra',
    expense.replace('昼食', '"unclosed'),
  ])('rejects unsupported rows atomically: %s', row => {
    expect(() => parse(`${income}\n${row}`)).toThrow();
  });
  it('rejects wrong header, empty data and oversized input', () => {
    expect(() => parseCsv('index,' + header)).toThrow();
    expect(() => parseCsv(header)).toThrow();
    expect(() => parseCsv('a'.repeat(2_000_001))).toThrow();
  });
  it('rejects missing, foreign and linked debit accounts', () => {
    const rows = parse(expense), s = state();
    expect(() => append(s, rows, 'missing')).toThrow();
    s.accounts[0].currency = 'USD';
    expect(() => append(s, rows, 'cash')).toThrow();
    s.accounts[0].currency = 'JPY'; s.accounts[0].type = 'debit';
    expect(() => append(s, rows, 'cash')).toThrow();
  });
});

const immediateHooks: ReactHooks = {
  useState: <S>(init: S | (() => S)) => [typeof init === 'function' ? (init as () => S)() : init, () => undefined],
  useRef: (current) => ({ current }),
  useEffect: () => undefined,
  useMemo: (factory) => factory(),
  useCallback: (callback) => callback,
};

describe('Monemy import persistence', () => {
  it('keeps the original state on a failed write and persists once on retry', async () => {
    let fail = true;
    let saved: FinanceState | null = null;
    let writes = 0;
    const store = createFinanceStoreHook(immediateHooks, {
      loadState: () => saved,
      saveState: (next) => {
        if (fail) throw new Error('Disk full');
        writes++;
        saved = next;
      },
      replaceState: vi.fn(),
    })(state());
    const preview = planMonemyImport(store.state, parse(expense), 'cash');
    await expect(store.importMonemyRows(preview)).rejects.toThrow('保存できませんでした');
    expect(saved).toBeNull();
    fail = false;
    await store.importMonemyRows(preview);
    expect(writes).toBe(1);
    expect(saved).toMatchObject({ transactions: [{ title: '昼食', amount: 1234 }] });
    await expect(store.importMonemyRows(preview)).rejects.toThrow('家計データが変わりました');
    expect(writes).toBe(1);
  });

  it('rejects a stale preview queued behind another write in the same render', async () => {
    const save = vi.fn();
    const store = createFinanceStoreHook(immediateHooks, { loadState: () => null, saveState: save, replaceState: vi.fn() })(state());
    const preview = planMonemyImport(store.state, parse(expense), 'cash');
    const clearing = store.clearAllData();
    await expect(store.importMonemyRows(preview)).rejects.toThrow('家計データが変わりました');
    expect(await clearing).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
