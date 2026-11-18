import { describe, expect, it } from 'vitest';
import { averageMonthlyNet, budgetOverview, buildPurchaseTransaction, installmentPlan, monthsUntilAffordable, sortCandidates } from './purchasePlan';
import type { FinanceState, Transaction } from '../types/finance';

const tx = (o: Partial<Transaction>): Transaction => ({ id: Math.random().toString(36), type: 'expense', amount: 0, date: '2026-10-10', categoryId: 'food', accountId: 'a', title: 't', ...o });
const state = (transactions: Transaction[], budgets: FinanceState['budgets'] = []): FinanceState => ({
  accounts: [{ id: 'a', name: 'a', type: 'bank', initialBalance: 0 }], transactions, budgets, recurringItems: [], savingsGoals: [],
});

describe('installmentPlan', () => {
  it('splits evenly at 0% and puts the remainder on the last payment', () => {
    const p = installmentPlan(10000, 3, 0)!;
    expect(p.schedule).toEqual([3334, 3334, 3332]);
    expect(p.total).toBe(10000);
    expect(p.interest).toBe(0);
  });
  it('adds interest with an annuity payment', () => {
    const p = installmentPlan(120000, 12, 15)!;
    expect(p.monthly).toBe(10831); // ceil(10830.997…), the standard annuity formula
    expect(p.total).toBe(p.monthly * 12);
    expect(p.interest).toBeGreaterThan(0);
  });
  it('rejects nonsense input', () => {
    expect(installmentPlan(0, 3, 0)).toBeUndefined();
    expect(installmentPlan(1000, 0, 0)).toBeUndefined();
    expect(installmentPlan(1000, 3, -1)).toBeUndefined();
  });
});

describe('monthsUntilAffordable', () => {
  it('is 0 when already affordable, rounds up, and is undefined without surplus', () => {
    expect(monthsUntilAffordable(50000, 60000, 0)).toBe(0);
    expect(monthsUntilAffordable(50000, 20000, 12000)).toBe(3);
    expect(monthsUntilAffordable(50000, 20000, 0)).toBeUndefined();
    expect(monthsUntilAffordable(50000, 20000, -5)).toBeUndefined();
  });
});

describe('averageMonthlyNet', () => {
  it('averages the full months before the given month', () => {
    const s = state([
      tx({ type: 'income', amount: 300000, date: '2026-10-25', categoryId: 'salary' }),
      tx({ amount: 100000, date: '2026-10-05' }),
      tx({ type: 'income', amount: 300000, date: '2026-09-25', categoryId: 'salary' }),
      tx({ amount: 200000, date: '2026-09-05' }),
      tx({ amount: 999999, date: '2026-11-02' }), // the current month is ignored
    ]);
    expect(averageMonthlyNet(s, '2026-11', 2)).toBe(150000);
  });
});

describe('budgetOverview', () => {
  it('counts a planned purchase and flags categories that go over', () => {
    const s = state([tx({ amount: 8000, date: '2026-11-03' })], [{ categoryId: 'food', monthlyLimit: 10000 }, { categoryId: 'daily', monthlyLimit: 5000 }]);
    const now = budgetOverview(s, '2026-11', undefined);
    expect(now).toMatchObject({ limit: 15000, spent: 8000, overCount: 0 });
    const plan = budgetOverview(s, '2026-11', undefined, { categoryId: 'food', amount: 3000 });
    expect(plan).toMatchObject({ spent: 11000, overCount: 1 });
    expect(plan.items[0]).toMatchObject({ categoryId: 'food', over: true });
  });
});

describe('purchase helpers', () => {
  it('sorts by priority then price and turns a candidate into an expense', () => {
    const items = [{ priority: 3 as const, amount: 1 }, { priority: 1 as const, amount: 900 }, { amount: 50 }, { priority: 1 as const, amount: 100 }];
    expect(sortCandidates(items).map((i) => i.amount)).toEqual([100, 900, 50, 1]);
    expect(buildPurchaseTransaction({ id: 'c', title: 'PC', categoryId: 'education', amount: 98000, month: '2026-11', ledgerId: 'personal', note: '' }, 'a', '2026-11-20'))
      .toMatchObject({ type: 'expense', amount: 98000, title: 'PC', accountId: 'a', ledgerId: 'personal', memo: undefined });
  });
});
