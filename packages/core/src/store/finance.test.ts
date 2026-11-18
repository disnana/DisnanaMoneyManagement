import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, computeAccountBalances, loadInitialState, sanitizeState } from './finance';
import type { FinanceState } from '../types/finance';

const base = (): FinanceState => ({
  accounts: [
    { id: 'bank', name: 'bank', type: 'bank', initialBalance: 100000 },
    { id: 'cash', name: 'cash', type: 'cash', initialBalance: 5000 },
    { id: 'debit', name: 'debit', type: 'debit', initialBalance: 0, linkedBankAccountId: 'bank' },
  ],
  transactions: [],
  budgets: [],
  recurringItems: [],
  savingsGoals: [],
});

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
};

describe('computeAccountBalances', () => {
  it('adds income net of withholding tax', () => {
    const s = base();
    s.transactions.push({ id: '1', type: 'income', amount: 10000, withholdingTax: 1021, date: '2026-11-01', categoryId: 'salary', accountId: 'bank', title: 'pay' });
    expect(computeAccountBalances(s).bank).toBe(108979);
  });

  it('deducts the real outflow (after points) for expenses', () => {
    const s = base();
    s.transactions.push({ id: '1', type: 'expense', amount: 4280, pointUsed: 480, date: '2026-11-01', categoryId: 'food', accountId: 'cash', title: 'x' });
    expect(computeAccountBalances(s).cash).toBe(1200);
  });

  it('charges debit-card spending to the linked bank account', () => {
    const s = base();
    s.transactions.push({ id: '1', type: 'expense', amount: 3000, date: '2026-11-01', categoryId: 'food', accountId: 'debit', title: 'x' });
    const b = computeAccountBalances(s);
    expect(b.bank).toBe(97000);
    expect(b.debit).toBe(0);
  });

  it('moves money between accounts and charges transfer fees to the source', () => {
    const s = base();
    s.transactions.push({ id: '1', type: 'transfer', amount: 20000, transferFee: 220, date: '2026-11-01', categoryId: 'transfer', accountId: 'bank', toAccountId: 'cash', title: 'x' });
    const b = computeAccountBalances(s);
    expect(b.bank).toBe(100000 - 20000 - 220);
    expect(b.cash).toBe(25000);
  });

  it('ignores transactions of unknown accounts', () => {
    const s = base();
    s.transactions.push({ id: '1', type: 'expense', amount: 999, date: '2026-11-01', categoryId: 'food', accountId: 'ghost', title: 'x' });
    expect(computeAccountBalances(s)).toEqual({ bank: 100000, cash: 5000, debit: 0 });
  });
});

describe('sanitizeState', () => {
  it('rejects data without accounts', () => {
    expect(sanitizeState({ accounts: [], transactions: [], budgets: [], recurringItems: [], savingsGoals: [] })).toBeNull();
    expect(sanitizeState({})).toBeNull();
  });

  it('drops malformed rows and coerces bad enums/numbers', () => {
    const s = sanitizeState({
      accounts: [
        { id: 'a', name: 'ok', type: 'weird' as never, initialBalance: 'x' as never },
        { id: 5 as never, name: 'bad' } as never,
      ],
      transactions: [
        { id: 't', type: 'nonsense' as never, amount: '12' as never, date: '2026-11-01', title: 't', accountId: 'a', categoryId: 'food' },
        { id: 'broken' } as never,
      ],
      budgets: [{ categoryId: 'food', monthlyLimit: 1000 }, { categoryId: 'x', monthlyLimit: NaN }],
      recurringItems: [],
      savingsGoals: [],
    });
    expect(s).not.toBeNull();
    expect(s!.accounts).toHaveLength(1);
    expect(s!.accounts[0]).toMatchObject({ type: 'bank', usageScope: 'personal', initialBalance: 0 });
    expect(s!.transactions).toHaveLength(1);
    expect(s!.transactions[0]).toMatchObject({ type: 'expense', amount: 12 });
    expect(s!.budgets).toHaveLength(1);
  });
});

describe('loadInitialState', () => {
  it('restores saved data', () => {
    const saved = base();
    const st = memoryStorage({ [STORAGE_KEY]: JSON.stringify(saved) });
    expect(loadInitialState(st).accounts).toHaveLength(3);
  });

  it('falls back to older storage keys', () => {
    const st = memoryStorage({ kakeibo_finance_state_v2: JSON.stringify(base()) });
    expect(loadInitialState(st).accounts).toHaveLength(3);
  });

  it('falls back to sample data on corrupted or empty storage', () => {
    expect(loadInitialState(memoryStorage({ [STORAGE_KEY]: '{oops' })).accounts.length).toBeGreaterThan(0);
    expect(loadInitialState(memoryStorage()).accounts.length).toBeGreaterThan(0);
  });
});
