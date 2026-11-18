import { describe, expect, it } from 'vitest';
import { assessPurchase, estimatePurchaseJPY, isPlanningDate, planSavings } from './planning';

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
