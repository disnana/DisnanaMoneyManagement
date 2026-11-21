/// <reference types="node" />
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FinanceState } from '../types/finance';
import { appendBankCsvRows, detectBankCsvFormat, parseBankCsvRows, planBankCsvImport, type BankCsvFormat } from './bankCsvImport';
import { readCsvRows } from './csv';

const smbc = '年月日,お引出し,お預入れ,お取り扱い内容,残高,メモ,ラベル';
const paypay = '操作日(年),操作日(月),操作日(日),操作時刻(時),操作時刻(分),操作時刻(秒),取引順番号,摘要,お支払金額,お預り金額,残高,メモ';
const digest = (text: string) => createHash('sha256').update(text, 'utf16le').digest('hex');
const parse = (format: BankCsvFormat, body: string) => parseBankCsvRows(format, readCsvRows(body), digest).rows;
const state = (): FinanceState => ({
  accounts: [
    { id: 'bank', type: 'bank', name: '預金', initialBalance: 123, ledgerId: 'work', usageScope: 'business' },
    { id: 'other', type: 'bank', name: '別口座', initialBalance: 0 },
    { id: 'cash', type: 'cash', name: '現金', initialBalance: 0 },
  ],
  transactions: [], budgets: [], recurringItems: [], savingsGoals: [],
});

describe('bank statement CSV', () => {
  it('recognizes the two headers and accepts quoted amounts and notes', () => {
    expect(detectBankCsvFormat(readCsvRows('\uFEFF' + smbc)[0])).toBe('smbc');
    expect(detectBankCsvFormat(readCsvRows(paypay)[0])).toBe('paypay');
    expect(detectBankCsvFormat(readCsvRows('日付,区分')[0])).toBeUndefined();
    const rows = parse('smbc', '2026/11/1,"1,234",,支払い,"-1,000","メモ\nその2",食費\r\n2026/11/2,,5000,入金,4000,,');
    expect(rows).toMatchObject([
      { date: '2026-11-01', type: 'expense', amount: 1234, balance: -1000, title: '支払い', memo: 'メモ\nその2\nラベル: 食費' },
      { date: '2026-11-02', type: 'income', amount: 5000, balance: 4000, title: '入金' },
    ]);
  });

  it('keeps SMBC rows distinct by running balance and occurrence, even after exclusion', () => {
    const a = '2026/11/1,500,,同一摘要,1500,,';
    const b = '2026/11/1,500,,同一摘要,2000,,';
    const rows = parse('smbc', [a, b, a].join('\n'));
    expect(new Set(rows.map(({ fingerprint }) => fingerprint)).size).toBe(3);
    const original = state();
    const first = planBankCsvImport(original, 'smbc', rows, 'bank', new Set([1]));
    expect(first).toMatchObject({ added: 2, duplicates: 0, expense: 1000 });
    const saved = appendBankCsvRows(first);
    expect(saved.accounts).toBe(original.accounts);
    expect(saved.transactions[0]).toMatchObject({ accountId: 'bank', ledgerId: 'work', scope: 'business' });
    // Editing a recorded transaction does not change the source identifier.
    saved.transactions[0] = { ...saved.transactions[0], amount: 600, accountId: 'other' };
    const again = planBankCsvImport(saved, 'smbc', rows, 'bank', new Set());
    expect(again).toMatchObject({ added: 1, duplicates: 2, expense: 500 });
    expect(again.duplicateIndexes).toEqual(new Set([0, 2]));
    expect(planBankCsvImport(saved, 'smbc', rows, 'other', new Set()).added).toBe(3);
  });

  it('uses the full PayPay datetime and preserves leading zeros in the source ID', () => {
    const entry = '2026,11,11,19,5,32,0000007,支払い,300,,156,メモ';
    const rows = parse('paypay', [entry, entry.replace('0000007', '7'), entry.replace(',32,', ',33,')].join('\n'));
    expect(new Set(rows.map(({ fingerprint }) => fingerprint)).size).toBe(3);
    const plan = planBankCsvImport(state(), 'paypay', rows, 'bank', new Set());
    expect(plan).toMatchObject({ added: 3, duplicates: 0, expense: 900 });
    const saved = appendBankCsvRows(plan);
    const updatedNotes = parse('paypay', entry.replace('メモ', 'メモ変更'));
    expect(planBankCsvImport(saved, 'paypay', updatedNotes, 'bank', new Set())).toMatchObject({ added: 0, duplicates: 1 });
    expect(() => parse('paypay', [entry, entry.replace(',300,', ',301,')].join('\n'))).toThrow('明細が一致しません');
  });

  it.each([
    '2026/2/30,1,,摘要,0,,',
    '2026/11/1,1,2,摘要,0,,',
    '2026/11/1,-1,,摘要,0,,',
    '2026/11/1,1.5,,摘要,0,,',
    '2026/11/1,1,,摘要,9007199254740992,,',
  ])('rejects invalid SMBC inputs before any write', (line) => {
    expect(() => parse('smbc', line)).toThrow('2行目');
  });

  it('excludes zero-amount SMBC balance rows from transaction history', () => {
    const result = parseBankCsvRows('smbc', readCsvRows('2026/11/1,,100,入金,100,,\n2026/10/31,,0,*,0,,'), digest);
    expect(result.rows).toHaveLength(1);
    expect(result.zeroAmountRows).toBe(1);
    expect(() => parse('smbc', '2026/11/1,,0,*,0,,')).toThrow('金額が0円の行');
  });

  it('rejects invalid PayPay times and ineligible destination accounts', () => {
    expect(() => parse('paypay', '2026,11,11,24,0,0,01,摘要,,500,600,')).toThrow('時刻が不正');
    const rows = parse('smbc', '2026/11/1,,100,摘要,100,,');
    expect(() => planBankCsvImport(state(), 'smbc', rows, 'cash', new Set())).toThrow('銀行口座');
    const foreign = state();
    foreign.accounts[0].currency = 'USD';
    expect(() => planBankCsvImport(foreign, 'smbc', rows, 'bank', new Set())).toThrow('銀行口座');
  });
});
