import { describe, expect, it } from 'vitest';
import { computeMonthCashFlow, computeMonthMetrics, getMonthTransactions, groupTransactionsByDate } from './metrics';
import type { FinanceState, Transaction } from '../types/finance';

const t = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36),
  type: 'expense',
  amount: 0,
  date: '2026-11-10',
  categoryId: 'food',
  accountId: 'a',
  title: 't',
  ...over,
});

const state = (transactions: Transaction[]): FinanceState => ({
  accounts: [{ id: 'a', name: 'a', type: 'bank', initialBalance: 0 }],
  transactions,
  budgets: [],
  recurringItems: [],
  savingsGoals: [],
});

describe('getMonthTransactions', () => {
  it('preserves source order and reindexes when the transaction array is replaced', () => {
    const first = t({ date: '2026-11-04' });
    const second = t({ date: '2026-11-10' });
    const other = t({ date: '2026-12-01' });
    const transactions = [first, other, second];

    const november = getMonthTransactions(transactions, '2026-11');
    expect(november).toEqual([first, second]);
    expect(getMonthTransactions(transactions, '2026-11')).toBe(november);
    expect(getMonthTransactions(transactions, '2026-12')).toEqual([other]);
    expect(getMonthTransactions([first, other], '2026-11')).toEqual([first]);
  });
});

describe('computeMonthMetrics', () => {
  it('sums income and expense for one month only', () => {
    const m = computeMonthMetrics(
      state([
        t({ type: 'income', amount: 7500, categoryId: 'salary' }),
        t({ type: 'income', amount: 2500, categoryId: 'other' }),
        t({ amount: 3000 }),
        t({ amount: 1000, categoryId: 'daily' }),
        t({ amount: 9999, date: '2026-10-31' }), // other month
      ]),
      '2026-11'
    );
    expect(m).toMatchObject({ income: 10000, expense: 4000, net: 6000 });
    expect(m.incomeCategoryBreakdown).toMatchObject([
      { categoryId: 'salary', amount: 7500, share: 0.75 },
      { categoryId: 'other', amount: 2500, share: 0.25 },
    ]);
  });

  it('shares totals while using current category names for the breakdown', () => {
    const data = state([t({ amount: 3000 }), t({ type: 'transfer', transferFee: 200 })]);
    const totals = computeMonthCashFlow(data, '2026-11');
    expect(totals).toEqual({ income: 0, expense: 3200, net: -3200 });
    const renamed = { ...data, customCategories: [{ id: 'food', name: '食事', type: 'expense' as const, color: '#ffffff' }] };
    expect(computeMonthCashFlow(renamed, '2026-11')).toBe(totals);
    expect(computeMonthMetrics(renamed, '2026-11').categoryBreakdown[0].name).toBe('食事');
  });

  it('counts transfer fees as expense under a dedicated category', () => {
    const m = computeMonthMetrics(
      state([t({ type: 'transfer', amount: 50000, transferFee: 220, categoryId: 'transfer' })]),
      '2026-11'
    );
    expect(m.expense).toBe(220);
    expect(m.categoryBreakdown[0]).toMatchObject({ categoryId: 'transfer_fee', amount: 220 });
  });

  it('sorts the breakdown by amount and shares sum to 1', () => {
    const m = computeMonthMetrics(state([t({ amount: 1000, categoryId: 'daily' }), t({ amount: 3000 })]), '2026-11');
    expect(m.categoryBreakdown.map((c) => c.categoryId)).toEqual(['food', 'daily']);
    expect(m.categoryBreakdown.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1);
  });
});

describe('groupTransactionsByDate', () => {
  it('groups newest first and totals each day', () => {
    const g = groupTransactionsByDate([
      t({ date: '2026-11-01', amount: 500 }),
      t({ id: 'first', date: '2026-11-03', type: 'income', amount: 2000 }),
      t({ id: 'second', date: '2026-11-03', amount: 300 }),
    ]);
    expect(g.map((x) => x.date)).toEqual(['2026-11-03', '2026-11-01']);
    expect(g[0].items.map((tx) => tx.id)).toEqual(['first', 'second']);
    expect(g[0].net).toBe(1700);
    expect(g[1].net).toBe(-500);
  });
});
