import { describe, expect, it } from 'vitest';
import {
  buildTransactionsCsv,
  formatJPY,
  formatSignedJPY,
  getDeductibleBusinessAmount,
  getEffectiveOutflow,
  getRecentMonths,
  getTransferTotalFees,
  shiftMonth,
} from './format';
import type { Transaction } from '../types/finance';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1',
  type: 'expense',
  amount: 1000,
  date: '2026-11-18',
  categoryId: 'food',
  accountId: 'a1',
  title: 'test',
  ...over,
});

describe('formatJPY / formatSignedJPY', () => {
  it('formats with thousands separators and a yen sign', () => {
    expect(formatJPY(1234567)).toBe('¥1,234,567');
    expect(formatJPY(0)).toBe('¥0');
  });
  it('puts the minus before the yen sign', () => {
    expect(formatJPY(-1500)).toBe('-¥1,500');
  });
  it('rounds to whole yen', () => {
    expect(formatJPY(99.6)).toBe('¥100');
  });
  it('signs by transaction type', () => {
    expect(formatSignedJPY(500, 'income')).toBe('+¥500');
    expect(formatSignedJPY(500, 'expense')).toBe('-¥500');
    expect(formatSignedJPY(500, 'transfer')).toBe('¥500');
  });
});

describe('month helpers', () => {
  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-03', 14)).toBe('2027-05');
  });
  it('lists the most recent months in ascending order', () => {
    expect(getRecentMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('amount helpers', () => {
  it('deducts points from the real outflow of an expense', () => {
    expect(getEffectiveOutflow(tx({ amount: 4280, pointUsed: 480 }))).toBe(3800);
    expect(getEffectiveOutflow(tx({ amount: 100, pointUsed: 500 }))).toBe(0);
  });
  it('does not touch non-expense amounts', () => {
    expect(getEffectiveOutflow(tx({ type: 'income', amount: 900 }))).toBe(900);
  });
  it('sums every transfer fee', () => {
    expect(
      getTransferTotalFees(tx({ type: 'transfer', transferFee: 100, platformTransferFee: 200, fxConversionFee: 50 }))
    ).toBe(350);
    expect(getTransferTotalFees(tx({ type: 'expense', transferFee: 100 }))).toBe(0);
  });
  it('applies the business ratio to deductible expenses', () => {
    expect(getDeductibleBusinessAmount(tx({ scope: 'business', businessRatio: 50, amount: 1001 }))).toBe(501);
    expect(getDeductibleBusinessAmount(tx({ scope: 'business', amount: 800 }))).toBe(800);
    expect(getDeductibleBusinessAmount(tx({ scope: 'personal', amount: 800 }))).toBe(0);
    expect(getDeductibleBusinessAmount(tx({ type: 'income', scope: 'business' }))).toBe(0);
  });
});

describe('buildTransactionsCsv', () => {
  const names = { a1: 'メイン銀行' };
  it('starts with a UTF-8 BOM and uses CRLF rows', () => {
    const csv = buildTransactionsCsv([tx({ title: 'a' }), tx({ id: 't2', title: 'b' })], names);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3); // header + 2 rows
  });
  it('quotes every cell and escapes embedded quotes', () => {
    const csv = buildTransactionsCsv([tx({ title: 'say "hi", ok' })], names);
    expect(csv).toContain('"say ""hi"", ok"');
  });
  it('writes expenses as negative amounts and resolves account names', () => {
    const [, row] = buildTransactionsCsv([tx({ amount: 1200 })], names).split('\r\n');
    expect(row).toContain('"-1200"');
    expect(row).toContain('"メイン銀行"');
  });
});
