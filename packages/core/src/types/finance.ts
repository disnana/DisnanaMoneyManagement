export type TransactionType = 'expense' | 'income' | 'transfer';

export type CurrencyCode = 'JPY' | 'USD' | 'EUR' | 'GBP' | 'AUD';

export type AccountType =
  | 'bank'
  | 'psp'
  | 'foreign_bank'
  | 'credit'
  | 'debit'
  | 'cash'
  | 'emoney'
  | 'investment';

export type AccountUsageScope = 'personal' | 'business' | 'household';

export type TransactionScope = 'personal' | 'business';

export type ReceiptMethod =
  | 'bank_transfer'
  | 'stripe_payout'
  | 'foreign_fx'
  | 'cash'
  | 'amazon_gift'
  | 'other_gift'
  | 'points'
  | 'crypto'
  | 'other';

export type IncomeTaxCategory =
  | 'salary'
  | 'business'
  | 'miscellaneous'
  | 'dividend'
  | 'temporary'
  | 'non_taxable';

export interface CategoryDef {
  id: string;
  name: string;
  type: 'expense' | 'income' | 'transfer';
  color: string;
  defaultAccountingSubject?: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  usageScope?: AccountUsageScope; // 個人用 / 業務用 / 家庭用
  initialBalance: number;
  currency?: CurrencyCode; // 通貨 (デフォルト JPY)
  fxRateToJpy?: number; // 参考円換算レート
  institution?: string;
  note?: string;
  // Credit card billing & limit settings (type === 'credit')
  closingDay?: number; // 1..28 or 31 (月末)
  paymentDay?: number; // 1..28 or 31 (月末)
  paymentMonthOffset?: 1 | 2; // 1: 翌月払い, 2: 翌々月払い
  creditLimit?: number;
  // Linked bank account (type === 'credit' | 'debit', must reference a 'bank' account)
  linkedBankAccountId?: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: string; // YYYY-MM-DD
  categoryId: string;
  accountId: string;
  toAccountId?: string;
  title: string;
  memo?: string;
  recurringId?: string;
  transferFee?: number;
  pointUsed?: number;
  scope?: TransactionScope;
  businessRatio?: number;
  accountingSubject?: string;
  counterparty?: string;
  receiptMethod?: ReceiptMethod;
  incomeTaxCategory?: IncomeTaxCategory;
  withholdingTax?: number;
  isPrepayment?: boolean;
  targetBillingMonth?: string;
  // Foreign currency & Stripe multi-stage payout metadata
  foreignCurrency?: CurrencyCode;
  foreignGrossAmount?: number;
  fxRate?: number;
  platformTransferFee?: number; // 第1段階: 海外プラットフォーム→Stripe移行手数料(円)
  fxConversionFee?: number; // 第2段階: Stripe為替・出金手数料(円)
  netJpyAmount?: number; // 銀行最終純入金額(円)
  settlementGroupId?: string; // 一括入金バッチ識別子
  /** 立替: 自分が支払い、後で相手から回収する支出（回収待ちの間は自分の支出として集計しない） */
  advance?: AdvanceInfo;
  /** この収入は立替の回収（元の取引 id）。収支・税務の集計から除外する */
  reimbursementOf?: string;
}

export interface AdvanceInfo {
  /** 立て替えた相手（誰の分か） */
  for: string;
  /** 回収した日 (YYYY-MM-DD) */
  reimbursedAt?: string;
  /** 回収として記録した入金取引の id */
  reimbursementTxId?: string;
}

export interface Budget {
  categoryId: string;
  monthlyLimit: number;
}

export interface RecurringItem {
  id: string;
  title: string;
  type: 'expense' | 'income';
  amount: number;
  categoryId: string;
  accountId: string;
  dayOfMonth: number;
  isActive: boolean;
  scope?: TransactionScope;
  accountingSubject?: string;
}

export interface SavingsGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  note?: string;
}

export interface FinanceState {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringItems: RecurringItem[];
  savingsGoals: SavingsGoal[];
}

export type NavSection =
  | 'dashboard'
  | 'analytics'
  | 'transactions'
  | 'budgets'
  | 'accounts'
  | 'planning'
  | 'tax';
