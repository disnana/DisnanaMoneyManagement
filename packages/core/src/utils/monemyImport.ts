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
export interface MonemyRow { id: string; type: 'income' | 'expense'; amount: number; date: string; category: string; title: string; memo: string }
export function parseMonemyCsv(text: string): MonemyRow[] {
  const [header, ...rows] = csv(text);
  if (!header || header.length !== HEADER.length || header.some((v, i) => v.trim() !== HEADER[i])) {
    throw new Error('Monemy CSVの列が一致しません。UTF-8のCSVを選択してください。');
  }
  if (!rows.length) throw new Error('取引がありません。');
  if (rows.length > 10000) throw new Error('1回の取り込みは10,000件までです。');
  const occurrences = new Map<string, number>();
  return rows.map((r, i) => {
    try {
      if (r.length !== HEADER.length) throw new Error('列数が一致しません。');
      const [date, kind, category, income, expense, title, memo] = r;
      if (!dateValid(date)) throw new Error('日付が不正です。');
      if (kind !== '収入' && kind !== '支出') throw new Error('収入・支出以外には対応していません。');
      const type = kind === '収入' ? 'income' : 'expense';
      if ((type === 'income' ? expense : income) !== '') throw new Error('反対側の金額欄は空欄にしてください。');
      const amount = yen(type === 'income' ? income : expense);
      // Preserve identical legitimate rows via their occurrence ordinal; exact re-imports are idempotent.
      const canonical = JSON.stringify([date, type, category, amount, title, memo]);
      const ordinal = (occurrences.get(canonical) ?? 0) + 1;
      occurrences.set(canonical, ordinal);
      const id = `tx_monemy_${encodeURIComponent(canonical)}_${ordinal}`;
      return { id, date, type, category, amount, title, memo };
    } catch (e) { throw new Error(`${i + 2}行目: ${(e as Error).message}`); }
  });
}

/** Pure append, used both for preview and atomically against the latest store on confirmation. */
export function appendMonemyRows(state: FinanceState, rows: MonemyRow[], accountId: string) {
  const account = state.accounts.find(a => a.id === accountId);
  if (!account || (account.currency && account.currency !== 'JPY') || account.type === 'debit') {
    throw new Error('取り込み先は円建ての口座を選んでください（連携デビットカードは対象外）。');
  }
  const ids = new Set(state.transactions.map(t => t.id));
  const categories: CategoryDef[] = [...(state.customCategories ?? [])];
  const transactions: Transaction[] = [];
  let duplicates = 0, income = 0, expense = 0;
  for (const row of rows) {
    const id = `${row.id}_${encodeURIComponent(accountId)}`;
    if (ids.has(id)) { duplicates++; continue; }
    ids.add(id);
    const categoryId = `custom_monemy_${row.type}_${encodeURIComponent(row.category || '未分類')}`;
    if (!categories.some(c => c.id === categoryId)) categories.push({ id: categoryId, name: row.category || '未分類', type: row.type, color: '#64748B' });
    transactions.push({ id, type: row.type, amount: row.amount, date: row.date, categoryId, accountId,
      title: row.title || row.category || 'Monemy取引', memo: row.memo, ledgerId: account.ledgerId,
      scope: account.usageScope === 'business' ? 'business' : 'personal' });
    if (row.type === 'income') income += row.amount; else expense += row.amount;
    if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expense)) throw new Error('合計金額が安全に扱える範囲を超えています。');
  }
  return { state: { ...state, customCategories: categories, transactions: [...transactions, ...state.transactions] }, added: transactions.length, duplicates, income, expense };
}
