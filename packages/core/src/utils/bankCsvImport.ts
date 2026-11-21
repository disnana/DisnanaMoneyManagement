import type { Account, FinanceState, Transaction } from '../types/finance';
import { csvHeaderMatches } from './csv';

const HEADERS = {
  smbc: ['年月日', 'お引出し', 'お預入れ', 'お取り扱い内容', '残高', 'メモ', 'ラベル'],
  paypay: ['操作日(年)', '操作日(月)', '操作日(日)', '操作時刻(時)', '操作時刻(分)', '操作時刻(秒)',
    '取引順番号', '摘要', 'お支払金額', 'お預り金額', '残高', 'メモ'],
};

export const BANK_CSV_NAMES = { smbc: '三井住友銀行', paypay: 'PayPay銀行' } as const;
export type BankCsvFormat = keyof typeof BANK_CSV_NAMES;
export type BankCsvRow = Pick<Transaction, 'type' | 'date' | 'amount' | 'title'> & {
  type: 'income' | 'expense';
  fingerprint: string;
  balance: number;
  memo: string;
};

export function detectBankCsvFormat(header?: string[]): BankCsvFormat | undefined {
  if (csvHeaderMatches(header, HEADERS.smbc)) return 'smbc';
  if (csvHeaderMatches(header, HEADERS.paypay)) return 'paypay';
}

function datePart(year: string, month: string, day: string) {
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) {
    throw new Error('日付が不正です。');
  }
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('日付が不正です。');
  }
  return date;
}

function timePart(value: string, max: number) {
  if (!/^\d{1,2}$/.test(value) || Number(value) > max) throw new Error('時刻が不正です。');
  return value.padStart(2, '0');
}

function readYen(raw: string) {
  const value = raw.trim();
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) throw new Error('金額・残高は整数円で指定してください。');
  const amount = Number(value.replace(/,/g, ''));
  if (!Number.isSafeInteger(amount)) throw new Error('金額が安全に扱える範囲を超えています。');
  return amount;
}

function amounts(out: string, incoming: string, runningBalance: string) {
  const expense = out.trim() === '' ? 0 : readYen(out);
  const income = incoming.trim() === '' ? 0 : readYen(incoming);
  const balance = readYen(runningBalance);
  if (expense < 0 || income < 0 || (expense > 0 && income > 0)) {
    throw new Error('入金・出金のいずれか一方に正の金額が必要です。');
  }
  if (expense === 0 && income === 0) return null;
  return { type: expense > 0 ? 'expense' as const : 'income' as const, amount: expense || income, balance };
}

export function parseBankCsvRows(format: BankCsvFormat, rows: string[][], digest: (text: string) => string) {
  if (!rows.length) throw new Error('取引がありません。');
  if (rows.length > 10_000) throw new Error('1回の取り込みは10,000件までです。');
  const occurrences = new Map<string, number>();
  const paypayEntries = new Map<string, string>();
  const transactions = rows.flatMap((row, index): BankCsvRow[] => {
    try {
      if (row.length !== HEADERS[format].length) throw new Error('列数が一致しません。');
      if (format === 'smbc') {
        const [rawDate, out, incoming, title, runningBalance, note, label] = row;
        const [year, month, day, extra] = rawDate.trim().split('/');
        if (!day || extra !== undefined) throw new Error('日付が不正です。');
        const date = datePart(year, month, day);
        const money = amounts(out, incoming, runningBalance);
        if (!money) return [];
        const key = digest(JSON.stringify([date, money.type, money.amount, money.balance, title.trim()]));
        const ordinal = (occurrences.get(key) ?? 0) + 1;
        occurrences.set(key, ordinal);
        return [{ ...money, date, title: title.trim(), memo: [note, label ? `ラベル: ${label}` : ''].filter(Boolean).join('\n'),
          fingerprint: `${key}_${ordinal}` }];
      }

      const [year, month, day, hour, minute, second, sequence, title, out, incoming, runningBalance, memo] = row;
      const date = datePart(year, month, day);
      const time = [timePart(hour, 23), timePart(minute, 59), timePart(second, 59)].join(':');
      if (!/^\d+$/.test(sequence)) throw new Error('取引順番号が不正です。');
      const money = amounts(out, incoming, runningBalance);
      if (!money) return [];
      const fingerprint = digest(JSON.stringify([date, time, sequence]));
      const details = JSON.stringify([money.type, money.amount, money.balance, title.trim()]);
      const prior = paypayEntries.get(fingerprint);
      if (prior !== undefined && prior !== details) throw new Error('同じ日時・取引順番号の明細が一致しません。');
      paypayEntries.set(fingerprint, details);
      return [{ ...money, date, title: title.trim(), memo, fingerprint }];
    } catch (error) {
      throw new Error(`${index + 2}行目: ${(error as Error).message}`);
    }
  });
  if (!transactions.length) throw new Error('取り込める入出金がありません。金額が0円の行は取り込み対象外です。');
  return { rows: transactions, zeroAmountRows: rows.length - transactions.length };
}

export function isBankCsvAccount(account: Account): boolean {
  return account.type === 'bank' && (!account.currency || account.currency === 'JPY');
}

export function planBankCsvImport(state: FinanceState, format: BankCsvFormat, rows: readonly BankCsvRow[],
  accountId: string, excluded: ReadonlySet<number>) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account || !isBankCsvAccount(account)) throw new Error('取り込み先に円建ての銀行口座を選んでください。');

  const prefix = `tx_bank_csv_${format}_${encodeURIComponent(accountId)}_`;
  const ids = new Set(state.transactions.filter((tx) => tx.id.startsWith(prefix)).map((tx) => tx.id));
  const duplicateIndexes = new Set<number>();
  const transactions: Transaction[] = [];
  let income = 0;
  let expense = 0;
  let startDate: string | undefined;
  let endDate: string | undefined;

  rows.forEach((row, index) => {
    const id = prefix + row.fingerprint;
    if (ids.has(id)) {
      duplicateIndexes.add(index);
      return;
    }
    if (excluded.has(index)) return;
    ids.add(id);
    if (!startDate || row.date < startDate) startDate = row.date;
    if (!endDate || row.date > endDate) endDate = row.date;
    transactions.push({
      id, type: row.type, amount: row.amount, date: row.date,
      categoryId: row.type === 'income' ? 'other_income' : 'other_expense',
      title: row.title || BANK_CSV_NAMES[format] + '明細', memo: row.memo,
      accountId, ledgerId: account.ledgerId, scope: account.usageScope === 'business' ? 'business' : 'personal',
    });
    if (row.type === 'income') income += row.amount;
    else expense += row.amount;
    if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expense)) {
      throw new Error('合計金額が安全に扱える範囲を超えています。');
    }
  });
  return { source: state, transactions, added: transactions.length, duplicates: duplicateIndexes.size,
    duplicateIndexes, income, expense, startDate, endDate };
}

export function appendBankCsvRows(plan: ReturnType<typeof planBankCsvImport>): FinanceState {
  return plan.added ? { ...plan.source, transactions: [...plan.transactions, ...plan.source.transactions] } : plan.source;
}
