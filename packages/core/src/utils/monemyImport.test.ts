import { describe, expect, it } from 'vitest';
import { appendMonemyRows, parseMonemyCsv } from './monemyImport';
import type { FinanceState } from '../types/finance';
const header = '日付,区分,項目,収入金額,支出金額,内容,メモ';
const expense = '2026-11-20,支出,食費,,1234.0,昼食,メモ';
const income = '2026-11-19,収入,給与,5000.0,,,給与メモ';
const parse = (body: string) => parseMonemyCsv(`${header}\n${body}`);
const state = (): FinanceState => ({ accounts: [{ id: 'cash', name: '財布', type: 'cash', initialBalance: 500 }], transactions: [], budgets: [], recurringItems: [], savingsGoals: [] });
describe('Monemy CSV', () => {
  it('parses BOM, CRLF, integer-looking decimals and preserves notes', () => {
    const rows = parseMonemyCsv(`\uFEFF${header}\r\n${expense}\r\n${income}\r\n`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ amount: 1234, date: '2026-11-20', title: '昼食', memo: 'メモ' });
    const result = appendMonemyRows(state(), rows, 'cash');
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
    expect(rows[0].id).not.toBe(rows[1].id);
    const first = appendMonemyRows(state(), rows, 'cash');
    expect(first.added).toBe(2);
    const second = appendMonemyRows(first.state, rows, 'cash');
    expect(second.added).toBe(0);
    expect(second.duplicates).toBe(2);
    expect(second.state.transactions).toHaveLength(2);
    expect(second.state.customCategories).toHaveLength(1);
  });
  it('appends without modifying existing data, budgets or opening balances', () => {
    const s = state();
    s.budgets.push({ categoryId: 'food', monthlyLimit: 5000 });
    const first = appendMonemyRows(s, parse(expense), 'cash');
    const second = appendMonemyRows(first.state, parse(`${income}\n${expense}`), 'cash');
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
    expect(() => parseMonemyCsv('index,' + header)).toThrow();
    expect(() => parseMonemyCsv(header)).toThrow();
    expect(() => parseMonemyCsv('a'.repeat(2_000_001))).toThrow();
  });
  it('rejects missing, foreign and linked debit accounts', () => {
    const rows = parse(expense), s = state();
    expect(() => appendMonemyRows(s, rows, 'missing')).toThrow();
    s.accounts[0].currency = 'USD';
    expect(() => appendMonemyRows(s, rows, 'cash')).toThrow();
    s.accounts[0].currency = 'JPY'; s.accounts[0].type = 'debit';
    expect(() => appendMonemyRows(s, rows, 'cash')).toThrow();
  });
});
