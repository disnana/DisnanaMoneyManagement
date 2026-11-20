import type { FinanceState, Transaction, CategoryDef } from '../types/finance';

const HEADER = ['日付', '区分', '項目', '収入金額', '支出金額', '内容', 'メモ'];
export const MAX_MONEMY_CHARS = 2_000_000;

/** Strict RFC-style CSV: quoted commas/newlines and doubled quotes are supported. */
function csv(text: string): string[][] {
  if (text.length > MAX_MONEMY_CHARS) throw new Error('CSVは2MB以下にしてください。');
  if (text.includes('\uFFFD') || text.includes('\0')) throw new Error('UTF-8のCSVを選択してください。');
  text = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const endField = () => { row.push(field); field = ''; closed = false; };
  const endRow = () => { endField(); if (row.some(v => v !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += c;
    } else if (c === ',') endField();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else if (c === '"' && field === '' && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error('CSVの引用符が不正です。'); field += c; }
  }
  if (quoted) throw new Error('CSVの引用符が閉じられていません。');
  if (field !== '' || row.length || closed) endRow();
  return rows;
}

function yen(value: string): number {
  // Do not round fractions, accept only exact integer yen (including 123.0).
  if (!/^\d+(?:\.0+)?$/.test(value)) throw new Error('金額は0以上の整数円のみ対応しています。');
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error('金額が安全に扱える範囲を超えています。');
  return n;
}
function dateValid(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export interface MonemyRow {
  fingerprint: string;
  categoryKey: string;
  type: 'income' | 'expense';
  amount: number;
  date: string;
  category: string;
  title: string;
  memo: string;
}

function canonicalRow(row: Pick<MonemyRow, 'date' | 'type' | 'category' | 'amount' | 'title' | 'memo'>): string {
  return JSON.stringify([row.date, row.type, row.category, row.amount, row.title, row.memo]);
}

export function parseMonemyCsv(text: string, sha256: (text: string) => string): MonemyRow[] {
  const [header, ...rows] = csv(text);
  if (!header || header.length !== HEADER.length || header.some((v, i) => v.trim() !== HEADER[i])) {
    throw new Error('Monemy CSVの列が一致しません。UTF-8のCSVを選択してください。');
  }
  if (!rows.length) throw new Error('取引がありません。');
  if (rows.length > 10000) throw new Error('1回の取り込みは10,000件までです。');
  const occurrences = new Map<string, { digest: string; count: number }>();
  const categoryKeys = new Map<string, string>();
  return rows.map((r, i) => {
    try {
      if (r.length !== HEADER.length) throw new Error('列数が一致しません。');
      const [date, kind, category, income, expense, title, memo] = r;
      if (!dateValid(date)) throw new Error('日付が不正です。');
      if (kind !== '収入' && kind !== '支出') throw new Error('収入・支出以外には対応していません。');
      const type = kind === '収入' ? 'income' : 'expense';
      if ((type === 'income' ? expense : income) !== '') throw new Error('反対側の金額欄は空欄にしてください。');
      const amount = yen(type === 'income' ? income : expense);
      const row = { date, type, category, amount, title, memo } as const;
      const canonical = canonicalRow(row);
      let occurrence = occurrences.get(canonical);
      if (!occurrence) {
        occurrence = { digest: sha256(canonical), count: 0 };
        occurrences.set(canonical, occurrence);
      }
      // Keep identical source rows distinct, while keeping reimports idempotent.
      const fingerprint = `${occurrence.digest}:${++occurrence.count}`;
      const categoryIdentity = JSON.stringify([type, category || '未分類']);
      let categoryKey = categoryKeys.get(categoryIdentity);
      if (!categoryKey) {
        categoryKey = `custom_monemy_sha256_${sha256(categoryIdentity)}`;
        categoryKeys.set(categoryIdentity, categoryKey);
      }
      return { ...row, fingerprint, categoryKey };
    } catch (e) {
      throw new Error(`${i + 2}行目: ${(e as Error).message}`);
    }
  });
}

/** Calculate additions once for a given state, then reuse them on confirmation. */
export function planMonemyImport(state: FinanceState, rows: readonly MonemyRow[], accountId: string) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account || (account.currency && account.currency !== 'JPY') || account.type === 'debit') {
    throw new Error('取り込み先は円建ての口座を選んでください（デビットカードは対象外）。');
  }
  const imported = new Set<string>();
  const legacyIds = new Set<string>();
  for (const tx of state.transactions) {
    if (tx.monemySource?.accountId === accountId) imported.add(tx.monemySource.fingerprint);
    else if (tx.id.startsWith('tx_monemy_%5B')) legacyIds.add(tx.id);
  }
  const categories = new Map((state.customCategories ?? []).map((category) => [category.id, category]));
  const transactions: Omit<Transaction, 'id'>[] = [];
  let duplicates = 0;
  let income = 0;
  let expense = 0;
  let startDate = rows[0]?.date;
  let endDate = startDate;
  for (const row of rows) {
    if (!startDate || row.date < startDate) startDate = row.date;
    if (!endDate || row.date > endDate) endDate = row.date;
    const ordinal = row.fingerprint.split(':')[1];
    if (imported.has(row.fingerprint) || (legacyIds.size > 0 &&
      legacyIds.has(`tx_monemy_${encodeURIComponent(canonicalRow(row))}_${ordinal}_${encodeURIComponent(accountId)}`))) {
      duplicates++;
      continue;
    }
    imported.add(row.fingerprint);
    const name = row.category || '未分類';
    const priorCategoryId = `custom_monemy_${row.type}_${encodeURIComponent(name)}`;
    const categoryId = categories.has(priorCategoryId) ? priorCategoryId : row.categoryKey;
    if (!categories.has(categoryId)) {
      const category: CategoryDef = { id: categoryId, name, type: row.type, color: '#64748B' };
      categories.set(categoryId, category);
    }
    transactions.push({
      type: row.type, amount: row.amount, date: row.date, categoryId, accountId,
      title: row.title || row.category || 'Monemy取引', memo: row.memo, ledgerId: account.ledgerId,
      scope: account.usageScope === 'business' ? 'business' : 'personal',
      monemySource: { accountId, fingerprint: row.fingerprint },
    });
    if (row.type === 'income') income += row.amount;
    else expense += row.amount;
    if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expense)) {
      throw new Error('合計金額が安全に扱える範囲を超えています。');
    }
  }
  return { source: state, transactions, customCategories: [...categories.values()],
    added: transactions.length, duplicates, income, expense, startDate, endDate };
}

export function appendMonemyRows(plan: ReturnType<typeof planMonemyImport>): FinanceState {
  if (!plan.added) return plan.source;
  const batchId = `tx_monemy_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const transactions = plan.transactions.map((tx, index) => ({ ...tx, id: `${batchId}_${index}` }));
  return { ...plan.source, customCategories: plan.customCategories, transactions: [...transactions, ...plan.source.transactions] };
}
