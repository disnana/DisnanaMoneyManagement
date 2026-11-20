import { describe, expect, it } from 'vitest';
import { computeCreditCardSummary, getBankCardWithdrawals, getBillingMonthForDate, getCycleRangeLabel, getPaymentWarning } from './creditCard';
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
  it.each([
    { month: '2026-03', day: 30, offset: 1, first: '2026-01-31', last: '2026-02-28' },
    { month: '2026-04', day: 30, offset: 1, first: '2026-03-01', last: '2026-03-30' },
    { month: '2028-04', day: 29, offset: 2, first: '2028-01-30', last: '2028-02-29' },
    { month: '2028-05', day: 28, offset: 2, first: '2028-02-29', last: '2028-03-28' },
    { month: '2027-03', day: 15, offset: 2, first: '2026-12-16', last: '2027-01-15' },
    { month: '2027-01', day: 31, offset: 1, first: '2026-12-01', last: '2026-12-31' },
  ] as const)('labels the exact range billed in $month on day $day with offset $offset', ({ month, day, offset, first, last }) => {
    const monthDay = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
    const adjacentDate = (date: string, days: number) => {
      const result = new Date(`${date}T00:00:00Z`);
      result.setUTCDate(result.getUTCDate() + days);
      return result.toISOString().slice(0, 10);
    };
    expect(getCycleRangeLabel(month, day, offset)).toBe(`${monthDay(first)} 〜 ${monthDay(last)} 利用分`);
    expect(getBillingMonthForDate(first, day, offset)).toBe(month);
    expect(getBillingMonthForDate(last, day, offset)).toBe(month);
    expect(getBillingMonthForDate(adjacentDate(first, -1), day, offset)).not.toBe(month);
    expect(getBillingMonthForDate(adjacentDate(last, 1), day, offset)).not.toBe(month);
  });

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
    expect(s.thisMonthUsage).toBe(0);
  });

  it('reuses history across months and updates after transaction or closing-day changes', () => {
    const transactions = [spend('first', '2026-11-20', 3000), spend('second', '2026-11-20', 5000)];
    const initial = computeCreditCardSummary(card, transactions, -8000, '2027-01');
    expect(initial.thisMonthTransactions.map(({ id }) => id)).toEqual(['first', 'second']);
    initial.thisMonthTransactions.reverse();
    expect(computeCreditCardSummary(card, transactions, -8000, '2027-01').thisMonthTransactions)
      .toEqual(transactions);
    expect(computeCreditCardSummary({ ...card, closingDay: 31 }, transactions, -8000, '2026-12').thisMonthGross).toBe(8000);
    const edited = [{ ...transactions[0], amount: 1000 }, transactions[1]];
    expect(computeCreditCardSummary(card, edited, -6000, '2027-01').thisMonthGross).toBe(6000);
    const unallocated = { ...spend('unallocated', '2027-01-09', 1500), type: 'transfer' as const,
      accountId: 'bank', toAccountId: card.id, isPrepayment: true };
    const paid = computeCreditCardSummary(card, [...edited, unallocated], -4500, '2027-01');
    expect(paid).toMatchObject({ thisMonthSettled: 1500, thisMonthRemaining: 4500, totalPrepaidCredit: 1500 });
  });

  it('computes available credit from the unpaid balance', () => {
    const s = computeCreditCardSummary(card, [spend('a', '2026-11-10', 30000)], -30000, '2026-12');
    expect(s.availableCredit).toBe(70000);
    expect(s.utilizationRatio).toBeCloseTo(0.3);
  });

  it('shows a warning for an unpaid upcoming statement across a month boundary', () => {
    const upcoming = { ...card, closingDay: 31, paymentDay: 1, paymentWarningDays: 3 };
    const purchase = spend('a', '2026-11-28', 5600);
    const s = computeCreditCardSummary(upcoming, [purchase], -5600, '2026-11');
    expect(s.thisMonthUsage).toBe(5600);
    expect(s.nextMonthRemaining).toBe(5600);
    expect(getPaymentWarning(s, '2026-11-28')).toBe(3);
    expect(getPaymentWarning(s, '2026-11-28', '2026-11')).toBeNull();
    expect(getPaymentWarning(s, '2026-11-28', '2026-12')).toBe(3);
    expect(getPaymentWarning(s, '2026-11-27')).toBeNull();
    expect(getPaymentWarning({ ...s, nextMonthRemaining: 0 }, '2026-11-28')).toBeNull();
  });

  it('reserves confirmed unpaid amounts and separate estimates for the chosen bank', () => {
    const linked = { ...card, linkedBankAccountId: 'bank', confirmedBillings: { '2026-12': 7000 } };
    const paid: Transaction = {
      ...spend('payment', '2026-12-10', 2000), type: 'transfer', accountId: 'bank',
      toAccountId: card.id, targetBillingMonth: '2026-12',
    };
    const tx = [spend('confirmed', '2026-11-10', 9900), spend('estimated', '2026-11-20', 3000), paid];
    expect(getBankCardWithdrawals([linked], tx, 'bank', '2026-12', '2026-12')).toEqual({ confirmed: 5000, estimated: 0 });
    expect(getBankCardWithdrawals([linked], tx, 'bank', '2026-12', '2027-01')).toEqual({ confirmed: 5000, estimated: 3000 });
    expect(getBankCardWithdrawals([linked], tx, 'other', '2026-12', '2027-01')).toEqual({ confirmed: 0, estimated: 0 });
    expect(getBankCardWithdrawals([{ ...linked, confirmedBillings: { '2026-12': 0 } }], tx, 'bank', '2026-12', '2026-12'))
      .toEqual({ confirmed: 0, estimated: 0 });
  });
});
