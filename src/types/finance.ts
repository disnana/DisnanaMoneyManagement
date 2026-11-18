export type TransactionType = 'expense' | 'income' | 'transfer';

export type AccountType =
  | 'bank'
  | 'credit'
  | 'debit'
  | 'cash'
  | 'emoney'
  | 'investment';

export type AccountUsageScope = 'personal' | 'business' | 'household';

export type TransactionScope = 'personal' | 'business';

export type ReceiptMethod =
  | 'bank_transfer'
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
