import { describe, expect, it } from 'vitest';
import { computeCreditCardSummary, getBillingMonthForDate, getCycleRangeLabel } from './creditCard';
import type { Account, Transaction } from '../types/finance';

describe('getBillingMonthForDate', () => {
  it('charges on/before the closing day to the next month (offset 1)', () => {
    expect(getBillingMonthForDate('2026-11-15', 15, 1)).toBe('2026-12');
    expect(getBillingMonthForDate('2026-11-01', 15, 1)).toBe('2026-12');
  });
  it('charges after the closing day one month later', () => {
    expect(getBillingMonthForDate('2026-11-16', 15, 1)).toBe('2027-01');
  });
  it('supports pay-in-two-months cards', () => {
    expect(getBillingMonthForDate('2026-11-10', 15, 2)).toBe('2027-01');
  });
  it('treats closing day 31 as end of month', () => {
    expect(getBillingMonthForDate('2026-11-30', 31, 1)).toBe('2026-12');
  });
});

describe('getCycleRangeLabel', () => {
  it('labels mid-month cycles', () => {
    expect(getCycleRangeLabel('2026-12', 15, 1)).toBe('10/16 〜 11/15 利用分');
  });
  it('labels month-end cycles', () => {
    expect(getCycleRangeLabel('2026-12', 31, 1)).toBe('11/1 〜 11/30 利用分');
  });
});

describe('computeCreditCardSummary', () => {
  const card: Account = {
    id: 'card',
    name: 'card',
    type: 'credit',
    initialBalance: 0,
    closingDay: 15,
    paymentDay: 10,
    paymentMonthOffset: 1,
    creditLimit: 100000,
  };
  const spend = (id: string, date: string, amount: number): Transaction => ({
    id,
    type: 'expense',
    amount,
    date,
    categoryId: 'food',
    accountId: 'card',
    title: id,
  });

  it('splits charges into this-month and next-month statements', () => {
    // reference month 2026-12: statement closing 11/15 is paid in Dec; closing 12/15 is paid in Jan
    const s = computeCreditCardSummary(
      card,
      [spend('a', '2026-11-10', 3000), spend('b', '2026-11-20', 5000)],
      -8000,
      '2026-12'
    );
    expect(s.thisMonthGross).toBe(3000);
    expect(s.nextMonthGross).toBe(5000);
    expect(s.thisMonthRemaining).toBe(3000);
  });

  it('computes available credit from the unpaid balance', () => {
    const s = computeCreditCardSummary(card, [spend('a', '2026-11-10', 30000)], -30000, '2026-12');
    expect(s.availableCredit).toBe(70000);
    expect(s.utilizationRatio).toBeCloseTo(0.3);
  });
});
