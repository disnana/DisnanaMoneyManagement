/// <reference types="node" />
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FinanceState } from '../types/finance';
import { appendStatementCsvRows, planStatementCsvImport } from './bankCsvImport';
import { computeCreditCardSummary } from './creditCard';
import { readCsvRows } from './csv';
import { isRakutenCsvHeader, parseRakutenCsvRows } from './rakutenCsvImport';

const header = '利用日,利用店名・商品名,利用者,支払方法,利用金額,手数料/利息,支払総額,12月支払金額,当月請求額,1月繰越残高,新規サイン';
const purchase = '2026/11/20,テスト商店,本人,1回払い,1200,0,1200,600,600,600,新規';
const foreignLine = ',現地利用額　12．00　変換レート　100．00円,,,,,,,,,';
const digest = (text: string) => createHash('sha256').update(text, 'utf16le').digest('hex');
const parse = (body: string) => parseRakutenCsvRows(readCsvRows(body), digest);
const data = (): FinanceState => ({
  accounts: [
    { id: 'card', name: 'テストカード', type: 'credit', initialBalance: 0, closingDay: 25, ledgerId: 'work' },
    { id: 'bank', name: '銀行', type: 'bank', initialBalance: 0 },
  ],
  transactions: [], budgets: [], recurringItems: [], savingsGoals: [],
});

describe('Rakuten Card statement CSV', () => {
  it('recognizes different statement months and retains a foreign-use note on the purchase', () => {
    expect(isRakutenCsvHeader(readCsvRows('\uFEFF' + header)[0])).toBe(true);
    expect(isRakutenCsvHeader(readCsvRows(header.replace('12月支払金額', '２月支払金額'))[0])).toBe(true);
    expect(isRakutenCsvHeader(readCsvRows(header.replace('12月支払金額', '13月支払金額'))[0])).toBe(false);
    const result = parse([purchase, foreignLine].join('\r\n'));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ date: '2026-11-20', amount: 1200, title: 'テスト商店', memo: expect.stringContaining('現地利用額') });
  });

  it('counts unsupported rows and excludes their continuation notes from supported rows', () => {
    const result = parse([purchase, purchase.replace('1回払い', '3回払い'), foreignLine,
      purchase.replace(',1200,0,', ',-1200,0,'), purchase.replace(',1200,0,', ',1200,1,'),
      purchase.replace(',1200,0,', ',0,0,')].join('\n'));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].memo).toBe('');
    expect(result).toMatchObject({ unsupportedRows: 3, zeroAmountRows: 1 });
    expect(() => parse(purchase.replace('1回払い', 'リボ払い'))).toThrow('1回払い');
  });

  it('deduplicates across statements but keeps legitimate identical rows distinct', () => {
    const rows = parse([purchase, purchase].join('\n')).rows;
    expect(rows[0].fingerprint).not.toBe(rows[1].fingerprint);
    const plan = planStatementCsvImport(data(), 'rakuten', rows, 'card', new Set([1]));
    expect(plan).toMatchObject({ added: 1, expense: 1200, income: 0 });
    const saved = appendStatementCsvRows(plan);
    expect(saved.transactions[0]).toMatchObject({ type: 'expense', accountId: 'card', ledgerId: 'work', amount: 1200 });
    expect(computeCreditCardSummary(saved.accounts[0], saved.transactions, -1200, '2026-12')).toMatchObject({
      thisMonthGross: 1200, thisMonthSettled: 0,
    });
    const updated = purchase.replace(',600,600,600,新規', ',0,0,0,継続');
    expect(planStatementCsvImport(saved, 'rakuten', parse(updated).rows, 'card', new Set())).toMatchObject({ added: 0, duplicates: 1 });
    expect(planStatementCsvImport(saved, 'rakuten', rows, 'card', new Set())).toMatchObject({ added: 1, duplicates: 1 });
    expect(() => planStatementCsvImport(data(), 'rakuten', rows, 'bank', new Set())).toThrow('クレジットカード口座');
  });

  it('rejects malformed charges and unsupported row structures before any write', () => {
    expect(() => parse(purchase.replace('11/20', '11/31'))).toThrow('2行目');
    expect(() => parse(purchase.replace(',1200,0,', ',1.5,0,'))).toThrow('整数円');
    expect(() => parse(purchase + ',extra')).toThrow('列数');
  });
});
