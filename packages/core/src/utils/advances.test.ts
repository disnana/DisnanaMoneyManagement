import { describe, expect, it } from 'vitest';
import { buildReimbursementTx, getPendingAdvances, isOwnFlow, pendingAdvanceTotals } from './advances';
import { computeMonthMetrics } from './metrics';
import { computeTaxSummary } from './tax';
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

describe('advances (立替)', () => {
  it('are not the user own expense, and neither is their payback', () => {
    const adv = t({ id: 'x', amount: 5000, advance: { for: '田中' } });
    const back = t({ type: 'income', amount: 5000, reimbursementOf: 'x', categoryId: 'other_income' });
    expect(isOwnFlow(adv)).toBe(false);
    expect(isOwnFlow(back)).toBe(false);
    const m = computeMonthMetrics(state([adv, back, t({ amount: 1000 })]), '2026-11');
    expect(m).toMatchObject({ income: 0, expense: 1000 });
  });

  it('lists pending ones with totals per person; reimbursed ones drop out', () => {
    const a = t({ amount: 3000, advance: { for: '田中' } });
    const b = t({ amount: 2000, advance: { for: '田中' } });
    const c = t({ amount: 700, advance: { for: '佐藤' } });
    const d = t({ amount: 999, advance: { for: '佐藤', reimbursedAt: '2026-11-20' } });
    expect(getPendingAdvances([a, b, c, d])).toHaveLength(3);
    expect(pendingAdvanceTotals([a, b, c, d])).toEqual([
      { name: '田中', amount: 5000 },
      { name: '佐藤', amount: 700 },
    ]);
  });

  it('builds a payback income linked to the original', () => {
    const adv = t({ id: 'x', amount: 4200, title: '飲み会', advance: { for: '田中' } });
    expect(buildReimbursementTx(adv, 'a', '2026-11-20')).toMatchObject({
      type: 'income',
      amount: 4200,
      reimbursementOf: 'x',
      accountId: 'a',
    });
  });
});

describe('computeTaxSummary', () => {
  it('computes deductible expenses by ratio, withholding and the estimated net', () => {
    const s = computeTaxSummary([
      t({ type: 'income', amount: 110000, categoryId: 'side_income', incomeTaxCategory: 'business', withholdingTax: 10000 }),
      t({ amount: 10000, scope: 'business', businessRatio: 50, accountingSubject: '通信費' }),
      t({ amount: 3000 }), // personal: not deductible
      t({ amount: 8000, scope: 'business', advance: { for: 'x' } }), // pass-through: ignored
    ]);
    expect(s.totalIncome).toBe(110000);
    expect(s.totalWithholding).toBe(10000);
    expect(s.businessAndMiscIncome).toBe(110000);
    expect(s.totalDeductibleExpense).toBe(5000);
    expect(s.estimatedBusinessNet).toBe(105000);
    expect(s.expenseBySubject).toEqual([{ subject: '通信費', gross: 10000, deductible: 5000, count: 1 }]);
  });
});
