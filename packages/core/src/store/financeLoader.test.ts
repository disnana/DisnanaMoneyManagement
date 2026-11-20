import { describe, expect, it, vi } from 'vitest';
import type { FinanceState } from '../types/finance';
import { createEmptyFinanceState, readLegacyFinanceState, requireFinanceState, STORAGE_KEY } from './financeState';
import { openFinanceState } from './financeLoader';
import { parseFinanceBackup, serializeFinanceBackup } from './financeBackup';

describe('opening a finance store', () => {
  it.each(['', '{', 'null', '{}', '{"accounts":[]}'])('never replaces unreadable data with defaults or an older snapshot: %j', async bad => {
    const legacy = new Map([[STORAGE_KEY, bad], ['kakeibo_finance_state_v2', JSON.stringify(createEmptyFinanceState())]]);
    const storage = {
      loadState: () => readLegacyFinanceState({ getItem: key => legacy.get(key) ?? null }),
      saveState: vi.fn(), replaceState: vi.fn(),
    };
    const initial = vi.fn(createEmptyFinanceState);
    await expect(openFinanceState(storage, initial)).rejects.toThrow();
    expect(initial).not.toHaveBeenCalled();
    expect(storage.saveState).not.toHaveBeenCalled();
    expect(storage.replaceState).not.toHaveBeenCalled();
    expect(legacy.get(STORAGE_KEY)).toBe(bad);
  });

  it('retries a transient read failure without writing, initializes an empty store once', async () => {
    let loaded: FinanceState | null = null;
    const loadState = vi.fn(() => loaded).mockImplementationOnce(() => { throw new Error('database busy'); });
    const saveState = vi.fn((state: FinanceState) => { loaded = state; });
    const storage = { loadState, saveState, replaceState: vi.fn() };
    await expect(openFinanceState(storage, createEmptyFinanceState)).rejects.toThrow('database busy');
    expect(saveState).not.toHaveBeenCalled();
    const first = await openFinanceState(storage, createEmptyFinanceState);
    expect(await openFinanceState(storage, createEmptyFinanceState)).toBe(first);
    expect(saveState).toHaveBeenCalledTimes(1);
  });
});

describe('finance documents', () => {
  it('preserves older numeric amounts and accepts both backup formats', () => {
    const payload = {
      ...createEmptyFinanceState(),
      budgets: [{ categoryId: 'food', monthlyLimit: '5000' }],
      savingsGoals: [{ id: 'goal', title: '目標', currentAmount: '250', targetAmount: '1000' }],
    };
    const raw = parseFinanceBackup(JSON.stringify(payload));
    expect(raw.budgets[0].monthlyLimit).toBe(5000);
    expect(raw.savingsGoals[0].currentAmount).toBe(250);
    expect(parseFinanceBackup(serializeFinanceBackup(raw))).toEqual(raw);
    expect(() => parseFinanceBackup(JSON.stringify({ format: 'dmm-finance-backup', version: 2, state: raw }))).toThrow();
  });

  it('rejects lossy migration of money, rows, classifications and user-defined ordering', () => {
    const initial = createEmptyFinanceState();
    const row = { id: 'tx', accountId: 'a', title: 't', amount: 1, date: '2026-02-01', categoryId: 'food', type: 'expense' };
    for (const patch of [
      { accounts: [{ ...initial.accounts[0], initialBalance: null }] },
      { accounts: [{ ...initial.accounts[0], type: 'future-type' }] },
      { accounts: [{ ...initial.accounts[0], usageScope: 'unknown' }] },
      { transactions: [row, row] }, { transactions: [{}] }, { transactions: [{ ...row, amount: 'x' }] },
      { transactions: [{ ...row, transferFee: 'x' }] }, { categoryOrder: { income: [null] } },
    ]) expect(() => requireFinanceState({ ...initial, ...patch })).toThrow();
  });
});
