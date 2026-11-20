import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, computeAccountBalances, createEmptyFinanceState, loadInitialState, sanitizeState } from './finance';
import type { FinanceState } from '../types/finance';
import { computeCreditCardSummary } from '../utils/creditCard';

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

  it.each([
    { points: 1000, fee: 220, bankBalance: 90780 },
    { points: 10000, fee: 0, bankBalance: 100000 },
  ])('settles the full card bill when $points yen are covered by points', ({ points, fee, bankBalance }) => {
    const s = base();
    const card = { id: 'card', name: 'card', type: 'credit' as const, initialBalance: 0, closingDay: 31 };
    s.accounts.push(card);
    s.transactions.push(
      { id: 'purchase', type: 'expense', amount: 10000, date: '2026-10-10', categoryId: 'food', accountId: 'card', title: 'purchase' },
      {
        id: 'payment', type: 'transfer', amount: 10000, pointUsed: points, transferFee: fee, date: '2026-11-10',
        categoryId: 'transfer', accountId: 'bank', toAccountId: 'card', targetBillingMonth: '2026-11', title: 'payment',
      },
    );
    const saved = loadInitialState(memoryStorage({ [STORAGE_KEY]: JSON.stringify(s) }));
    const balances = computeAccountBalances(saved);
    expect(balances.bank).toBe(bankBalance);
    expect(balances.card).toBe(0);
    expect(computeCreditCardSummary(card, saved.transactions, balances.card, '2026-11')).toMatchObject({
      thisMonthGross: 10000, thisMonthSettled: 10000, thisMonthRemaining: 0, totalUnpaidBalance: 0,
    });
  });

  it('ignores transactions of unknown accounts', () => {
    const s = base();
    s.transactions.push({ id: '1', type: 'expense', amount: 999, date: '2026-11-01', categoryId: 'food', accountId: 'ghost', title: 'x' });
    expect(computeAccountBalances(s)).toEqual({ bank: 100000, cash: 5000, debit: 0 });
  });
});

describe('sanitizeState', () => {
  it('allows an empty account list and rejects a missing collection', () => {
    expect(sanitizeState({ accounts: [], transactions: [], budgets: [], recurringItems: [], savingsGoals: [] })?.accounts).toEqual([]);
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
  it('can start with zero balances and preserve existing data on later launches', () => {
    const storage = memoryStorage();
    const firstLaunch = loadInitialState(storage, createEmptyFinanceState);
    expect(firstLaunch.accounts.map((account) => account.initialBalance)).toEqual([0]);
    expect(firstLaunch.transactions).toEqual([]);
    storage.setItem(STORAGE_KEY, JSON.stringify(base()));
    expect(loadInitialState(storage, createEmptyFinanceState).accounts).toHaveLength(3);
  });

  it('restores saved data', () => {
    const saved = base();
    const st = memoryStorage({ [STORAGE_KEY]: JSON.stringify(saved) });
    expect(loadInitialState(st).accounts).toHaveLength(3);
  });

  it('falls back to older storage keys', () => {
    const st = memoryStorage({ kakeibo_finance_state_v2: JSON.stringify(base()) });
    expect(loadInitialState(st).accounts).toHaveLength(3);
  });

  it('protects unreadable saves and only seeds an empty storage', () => {
    expect(() => loadInitialState(memoryStorage({ [STORAGE_KEY]: '{oops' }))).toThrow();
    expect(loadInitialState(memoryStorage()).accounts.length).toBeGreaterThan(0);
  });
});
