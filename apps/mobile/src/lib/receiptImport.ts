import type { ReceiptDocument } from './androidReceiptClient';

export type ReceiptImportMode = 'merchant' | 'items';
export type ReceiptItemEdit = { name: string; amount: string; included: boolean };
type ReceiptExpenseItem = { title: string; amount: number };

export type ReceiptImport = {
  mode: ReceiptImportMode;
  merchant: string;
  date: string | null;
  total: number;
  entries: ReceiptExpenseItem[];
  memo?: string;
};

export function canImportReceipt(document: ReceiptDocument) {
  return (document.status === 'success' || document.status === 'partial') &&
    document.currency === 'JPY' && document.document_type !== 'atm_statement';
}

export function initialReceiptItems(document: ReceiptDocument): ReceiptItemEdit[] {
  return document.items.map((item) => ({
    name: item.name ?? '',
    amount: item.amount_minor === null ? '' : String(item.amount_minor),
    included: true,
  }));
}

export function receiptImportDraft(document: ReceiptDocument, mode: ReceiptImportMode, edits: readonly ReceiptItemEdit[]): ReceiptImport | undefined {
  if (!canImportReceipt(document) || edits.length !== document.items.length) return;
  const merchant = document.merchant ?? '';
  const printedTotal = document.total_minor;
  const memo = mode === 'merchant' ? edits.filter((item) => item.included && item.name.trim())
    .map((item) => item.name.trim()).join(' / ') || undefined : undefined;
  const unchangedAmounts = edits.every((item, index) => item.included &&
    item.amount === (document.items[index].amount_minor === null ? '' : String(document.items[index].amount_minor)));
  if (mode === 'merchant' && unchangedAmounts && printedTotal !== null && Number.isSafeInteger(printedTotal) && printedTotal > 0) {
    return { mode, merchant, date: document.date, total: printedTotal, entries: [], memo };
  }

  const entries: ReceiptExpenseItem[] = [];
  let total = 0;
  for (const [index, item] of edits.entries()) {
    if (!item.included) continue;
    if (!/^\d+$/.test(item.amount)) return;
    const amount = Number(item.amount);
    if (!Number.isSafeInteger(amount) || amount < 0) return;
    if (amount === 0) continue;
    const title = item.name.trim() || `商品 ${index + 1}`;
    entries.push({ title, amount });
    total += amount;
  }
  if (total <= 0 || !Number.isSafeInteger(total)) return;
  return { mode, merchant, date: document.date, total, entries: mode === 'items' ? entries : [], memo };
}

// The route carries only an ID. Receipt contents stay in memory until saved or replaced.
let pending: { id: string; draft: ReceiptImport } | undefined;

export function stageReceiptImport(id: string, draft: ReceiptImport) {
  pending = { id, draft };
}

export function getReceiptImport(id: string) {
  return pending?.id === id ? pending.draft : undefined;
}

export function clearReceiptImport(id: string) {
  if (pending?.id === id) pending = undefined;
}
