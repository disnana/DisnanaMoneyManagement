import { describe, expect, it } from 'vitest';
import { computeMonthMetrics, groupTransactionsByDate } from './metrics';
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

describe('computeMonthMetrics', () => {
  it('sums income and expense for one month only', () => {
    const m = computeMonthMetrics(
      state([
        t({ type: 'income', amount: 10000, categoryId: 'salary' }),
        t({ amount: 3000 }),
        t({ amount: 1000, categoryId: 'daily' }),
        t({ amount: 9999, date: '2026-10-31' }), // other month
      ]),
      '2026-11'
    );
    expect(m).toMatchObject({ income: 10000, expense: 4000, net: 6000 });
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
      t({ date: '2026-11-03', type: 'income', amount: 2000 }),
      t({ date: '2026-11-03', amount: 300 }),
    ]);
    expect(g.map((x) => x.date)).toEqual(['2026-11-03', '2026-11-01']);
    expect(g[0].items).toHaveLength(2);
    expect(g[0].net).toBe(1700);
    expect(g[1].net).toBe(-500);
  });
});
