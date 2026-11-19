import { describe, expect, it } from 'vitest';
import { isPlanningDate } from '../utils/planning';
import { createInitialSeedData } from './seedData';

describe('sample finance data', () => {
  it.each([
    { month: '2026-12', earliest: '2026-07', next: '2027-01', firstGoal: '2027-07-28' },
    { month: '2027-01', earliest: '2026-08', next: '2027-02', firstGoal: '2027-08-28' },
  ])('rebuilds sample dates around $month', ({ month, earliest, next, firstGoal }) => {
    const sample = createInitialSeedData(month);
    const transactionMonths = sample.transactions.map(({ date }) => date.slice(0, 7)).sort();
    expect(transactionMonths[0]).toBe(earliest);
    expect(transactionMonths.at(-1)).toBe(month);
    expect(sample.transactions.every(({ date }) => isPlanningDate(date))).toBe(true);
    expect(sample.transactions.find(({ id }) => id === 'tx_m0_prepay')?.targetBillingMonth).toBe(next);
    expect(sample.savingsGoals[0].targetDate).toBe(firstGoal);
    expect(sample.savingsGoals.every(({ targetDate }) => targetDate && isPlanningDate(targetDate))).toBe(true);
    expect(sample.purchaseCandidates?.find(({ status }) => status === 'confirmed')?.plannedDate).toBe(`${month}-25`);
  });
});
