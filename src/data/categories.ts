import {
  AccountType,
  AccountUsageScope,
  CategoryDef,
  CurrencyCode,
  IncomeTaxCategory,
  ReceiptMethod,
} from '../types/finance';

export const CURRENCY_META: Record<
  CurrencyCode,
  { code: CurrencyCode; symbol: string; label: string; defaultRate: number }
> = {
  JPY: { code: 'JPY', symbol: '¥', label: 'JPY (日本円)', defaultRate: 1 },
  USD: { code: 'USD', symbol: '$', label: 'USD (米ドル)', defaultRate: 152 },
  EUR: { code: 'EUR', symbol: '€', label: 'EUR (ユーロ)', defaultRate: 165 },
  GBP: { code: 'GBP', symbol: '£', label: 'GBP (英ポンド)', defaultRate: 194 },
  AUD: { code: 'AUD', symbol: 'A$', label: 'AUD (豪ドル)', defaultRate: 100 },
};

export const FOREIGN_CURRENCIES: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'AUD'];

export const EXPENSE_CATEGORIES: CategoryDef[] = [
  { id: 'food', name: '食費', type: 'expense', color: '#0F766E', defaultAccountingSubject: '福利厚生費' },
  { id: 'dining', name: '外食・カフェ・会議', type: 'expense', color: '#0284C7', defaultAccountingSubject: '会議費' },
  { id: 'daily', name: '日用品・消耗品', type: 'expense', color: '#4F46E5', defaultAccountingSubject: '消耗品費' },
  { id: 'housing', name: '住居費・家賃', type: 'expense', color: '#334155', defaultAccountingSubject: '地代家賃' },
  { id: 'utilities', name: '水道・光熱・通信', type: 'expense', color: '#D97706', defaultAccountingSubject: '通信費' },
  { id: 'transport', name: '交通費・移動', type: 'expense', color: '#059669', defaultAccountingSubject: '旅費交通費' },
  { id: 'hobby', name: '趣味・娯楽・交際', type: 'expense', color: '#7C3AED', defaultAccountingSubject: '接待交際費' },
  { id: 'clothing', name: '衣服・美容', type: 'expense', color: '#DB2777', defaultAccountingSubject: '雑費' },
  { id: 'medical', name: '医療・保険', type: 'expense', color: '#DC2626', defaultAccountingSubject: '損害保険料' },
  { id: 'education', name: '書籍・ソフト・研修', type: 'expense', color: '#2563EB', defaultAccountingSubject: '新聞図書費' },
  { id: 'business_ops', name: '業務委託・広告・手数料', type: 'expense', color: '#0D9488', defaultAccountingSubject: '支払手数料' },
  { id: 'other_expense', name: 'その他支出', type: 'expense', color: '#64748B', defaultAccountingSubject: '雑費' },
];

export const INCOME_CATEGORIES: CategoryDef[] = [
  { id: 'salary', name: '給与・賞与', type: 'income', color: '#059669' },
  { id: 'side_income', name: '事業・フリーランス売上', type: 'income', color: '#0F766E' },
  { id: 'misc_income', name: '雑収入・ポイント・ギフト', type: 'income', color: '#D97706' },
  { id: 'investment_income', name: '配当・利息・売却益', type: 'income', color: '#0284C7' },
  { id: 'other_income', name: '臨時収入・その他', type: 'income', color: '#64748B' },
];

export const TRANSFER_CATEGORY: CategoryDef = {
  id: 'transfer',
  name: '口座振替',
  type: 'transfer',
  color: '#475569',
};

export const ALL_CATEGORIES: CategoryDef[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
  TRANSFER_CATEGORY,
];

export function getCategoryById(id: string): CategoryDef {
  return (
    ALL_CATEGORIES.find((c) => c.id === id) ?? {
      id,
      name: '未分類',
      type: 'expense',
      color: '#64748B',
    }
  );
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: '銀行口座',
  psp: '決済サービス (Stripe等)',
  foreign_bank: '外貨・海外受取口座',
  credit: 'クレジットカード',
  debit: 'デビットカード',
  cash: '現金・財布',
  emoney: '電子マネー・QR',
  investment: '証券・貯蓄口座',
};

export const ACCOUNT_USAGE_LABELS: Record<AccountUsageScope, string> = {
  personal: '個人用',
  household: '家庭用',
  business: '業務用',
};

export const RECEIPT_METHOD_LABELS: Record<ReceiptMethod, string> = {
  bank_transfer: '銀行振込',
  stripe_payout: 'Stripe経由・為替入金',
  foreign_fx: '外貨プラットフォーム受取',
  cash: '現金',
  amazon_gift: 'Amazonギフト券',
  other_gift: 'その他ギフト券・商品券',
  points: 'ポイント・電子残高付与',
  crypto: '暗号資産',
  other: 'その他（現物支給・謝礼等）',
};

export const INCOME_TAX_CATEGORY_LABELS: Record<IncomeTaxCategory, string> = {
  salary: '給与所得',
  business: '事業所得',
  miscellaneous: '雑所得',
  dividend: '配当・利子所得',
  temporary: '一時所得',
  non_taxable: '非課税・贈与等',
};

export const ACCOUNTING_SUBJECTS: string[] = [
  '消耗品費',
  '通信費',
  '旅費交通費',
  '地代家賃',
  '水道光熱費',
  '接待交際費',
  '会議費',
  '新聞図書費',
  '外注費',
  '広告宣伝費',
  '支払手数料',
  '損害保険料',
  '租税公課',
  '雑費',
];
