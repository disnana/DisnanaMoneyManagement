import { describe, expect, it } from 'vitest';
import { assessPurchase, comparePurchaseCash, estimatePurchaseJPY, isPlanningDate, planSavings } from './planning';
import { getCategoryById, getOrderedCategories } from '../data/categories';

describe('purchase estimates', () => {
  it('calculates remaining budget and shortfall after recorded spending', () => {
    expect(assessPurchase(10000, 4000, 3000)).toEqual({ available: 6000, remaining: 3000, shortfall: 0 });
    expect(assessPurchase(10000, 12000, 3000)).toEqual({ available: 0, remaining: -5000, shortfall: 5000 });
    expect(assessPurchase(undefined, 4000, 3000)).toBeUndefined();
  });

  it('rounds the converted amount to whole yen and adds the fee once', () => {
    expect(estimatePurchaseJPY({ currency: 'USD', amount: 12.75, yenPerUnit: 150.13, feeJPY: 250 })).toBe(2164);
    expect(estimatePurchaseJPY({ currency: 'EUR', amount: 12, yenPerUnit: 0, feeJPY: 100 })).toBeUndefined();
    expect(estimatePurchaseJPY({ currency: 'GBP', amount: 20, yenPerUnit: 190, feeJPY: -1 })).toBeUndefined();
  });

  it('compares funding options without adding same-account savings on top of the bank balance', () => {
    expect(comparePurchaseCash(30000, 10000, 17000, 5000, { available: 4000, sameAccount: true })).toEqual({
      bankRemaining: 3000, free: -6000, savingsUsed: 4000, afterSavings: -2000, contributionCut: 5000, afterContributionCut: -1000,
    });
    expect(comparePurchaseCash(30000, 10000, 21000, 1000, { available: 8000, sameAccount: false })).toMatchObject({
      bankRemaining: -1000, free: -2000, savingsUsed: 2000, afterSavings: 0,
    });
  });
});

describe('savings plans', () => {
  const goal = { id: 'goal', title: '旅行', targetAmount: 60000, currentAmount: 15000, monthlyContribution: 10000 };

  it('counts monthly contributions from the current month across a year boundary', () => {
    expect(planSavings({ ...goal, targetDate: '2027-01-31' }, '2026-11-18')).toEqual({
      remaining: 45000, overdue: false, monthlyRequired: 15000, monthlyShortfall: 5000, monthsToGoal: 5,
    });
  });

  it('handles overdue and already achieved goals without a negative monthly amount', () => {
    expect(planSavings({ ...goal, targetDate: '2026-09-30' }, '2026-11-18').overdue).toBe(true);
    expect(planSavings({ ...goal, currentAmount: 60000, targetDate: '2026-09-30' }, '2026-11-18').monthlyRequired).toBeUndefined();
    expect(isPlanningDate('2026-02-29')).toBe(false);
    expect(isPlanningDate('2028-02-29')).toBe(true);
  });
});

it('keeps hidden names in history while using custom order for new entries', () => {
  const custom = { id: 'custom_books', name: '本', type: 'expense' as const, color: '#123456', icon: 'education' };
  const order = getOrderedCategories('expense', [custom], ['custom_books', 'food', 'unknown'], ['food']);
  expect(order[0]).toEqual(custom);
  expect(order.some((item) => item.id === 'food')).toBe(false);
  expect(getCategoryById('food', [custom]).name).toBe('食費');
});
