import { Transaction } from '../types/finance';
import {
  getCategoryById,
  INCOME_TAX_CATEGORY_LABELS,
  RECEIPT_METHOD_LABELS,
} from '../data/categories';

const jpyFormatter = new Intl.NumberFormat('ja-JP');

export function formatJPY(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  const formatted = jpyFormatter.format(abs);
  return amount < 0 ? `-¥${formatted}` : `¥${formatted}`;
}

export function formatSignedJPY(
  amount: number,
  type: 'income' | 'expense' | 'transfer'
): string {
  const abs = Math.abs(Math.round(amount));
  const formatted = jpyFormatter.format(abs);
  if (type === 'income') return `+¥${formatted}`;
  if (type === 'expense') return `-¥${formatted}`;
  return `¥${formatted}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return `${year}年${month}月`;
}

export function formatShortDate(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const dateObj = new Date(y, m - 1, d);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const wd = weekdays[dateObj.getDay()] ?? '';
  return `${m}/${d} (${wd})`;
}

export function formatFullDate(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${y}年${m}月${d}日`;
}

export function formatDayLabel(day?: number): string {
  if (!day || day >= 31) return '月末';
  return `${day}日`;
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getRecentMonths(endMonthKey: string, count: number): string[] {
  const result: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    result.push(shiftMonth(endMonthKey, -i));
  }
  return result;
}

export function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getEffectiveOutflow(tx: Transaction): number {
  if (tx.type === 'expense') {
    return Math.max(0, tx.amount - (tx.pointUsed ?? 0));
  }
  return tx.amount;
}

export function getDeductibleBusinessAmount(tx: Transaction): number {
  if (tx.type === 'transfer' && (tx.transferFee ?? 0) > 0 && tx.scope === 'business') {
    return tx.transferFee ?? 0;
  }
  if (tx.type !== 'expense') return 0;
  const ratio = tx.businessRatio ?? (tx.scope === 'business' ? 100 : 0);
  if (ratio <= 0) return 0;
  return Math.round(tx.amount * (ratio / 100));
}

export function exportTransactionsToCSV(
  transactions: Transaction[],
  accountMap: Record<string, string>,
  filename = 'dmm-transactions.csv'
): void {
  const header = [
    '日付',
    '種別',
    '区分(個人/事業)',
    'タイトル',
    'カテゴリ',
    '勘定科目',
    '取引先・支払元',
    '出金/入金元口座',
    '振替先口座',
    '金額(円)',
    'ポイント充当(円)',
    '実支払・請求額(円)',
    '振替手数料(円)',
    '家事按分率(%)',
    '事業経費算入額(円)',
    '所得区分',
    '受取形態',
    '源泉徴収税額(円)',
    'メモ',
  ];

  const typeLabelMap = {
    expense: '支出',
    income: '収入',
    transfer: '振替',
  };

  const escapeCsv = (val: string) => {
    const clean = val.replace(/"/g, '""');
    return `"${clean}"`;
  };

  const rows = transactions.map((tx) => {
    const netAmount = tx.type === 'expense' ? getEffectiveOutflow(tx) : tx.amount;
    const deductible = getDeductibleBusinessAmount(tx);
    const ratio = tx.businessRatio ?? (tx.scope === 'business' ? 100 : 0);

    return [
      tx.date,
      typeLabelMap[tx.type],
      tx.scope === 'business' ? '事業・経費' : 'プライベート',
      tx.title,
      getCategoryById(tx.categoryId).name,
      tx.accountingSubject ?? '',
      tx.counterparty ?? '',
      accountMap[tx.accountId] ?? '不明な口座',
      tx.toAccountId ? accountMap[tx.toAccountId] ?? '不明な口座' : '',
      String(tx.type === 'expense' ? -tx.amount : tx.amount),
      String(tx.pointUsed ?? 0),
      String(tx.type === 'expense' ? -netAmount : netAmount),
      String(tx.transferFee ?? 0),
      String(ratio),
      String(deductible),
      tx.incomeTaxCategory ? INCOME_TAX_CATEGORY_LABELS[tx.incomeTaxCategory] : '',
      tx.receiptMethod ? RECEIPT_METHOD_LABELS[tx.receiptMethod] : '',
      String(tx.withholdingTax ?? 0),
      tx.memo ?? '',
    ];
  });

  const csvContent =
    '\uFEFF' +
    [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
