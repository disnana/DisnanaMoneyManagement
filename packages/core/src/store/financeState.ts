import type { Account, Budget, FinanceState, Ledger, RecurringItem, SavingsGoal, Transaction } from '../types/finance';
import { ALL_CATEGORIES } from '../data/categories';
import { createInitialSeedData } from '../data/seedData';
import { getCurrentMonthKey } from '../utils/format';
import { estimatePurchaseJPY } from '../utils/planning';

export const STORAGE_KEY = 'kakeibo_finance_state_v3';

const VALID_ACCOUNT_TYPES = new Set([
  'bank',
  'psp',
  'foreign_bank',
  'credit',
  'debit',
  'cash',
  'emoney',
  'investment',
]);

export function sanitizeState(parsed: Partial<FinanceState>): FinanceState | null {
  if (
    !Array.isArray(parsed.accounts) ||
    !Array.isArray(parsed.transactions) ||
    !Array.isArray(parsed.budgets) ||
    !Array.isArray(parsed.recurringItems) ||
    !Array.isArray(parsed.savingsGoals)
  ) {
    return null;
  }

  const accounts: Account[] = parsed.accounts
    .filter((a): a is Account => Boolean(a && typeof a.id === 'string' && typeof a.name === 'string'))
    .map((a) => ({
      ...a,
      type: VALID_ACCOUNT_TYPES.has(a.type) ? a.type : 'bank',
      usageScope:
        a.usageScope === 'personal' || a.usageScope === 'household' || a.usageScope === 'business'
          ? a.usageScope
          : 'personal',
      initialBalance: Number.isFinite(Number(a.initialBalance)) ? Number(a.initialBalance) : 0,
    }));

  if (parsed.accounts.length > 0 && accounts.length === 0) return null;

  const transactions: Transaction[] = parsed.transactions
    .filter(
      (t): t is Transaction =>
        Boolean(
          t &&
            typeof t.id === 'string' &&
            typeof t.date === 'string' &&
            typeof t.title === 'string' &&
            typeof t.accountId === 'string'
        )
    )
    .map((t) => ({
      ...t,
      type:
        t.type === 'income' || t.type === 'expense' || t.type === 'transfer'
          ? t.type
          : 'expense',
      amount: Number.isFinite(Number(t.amount)) ? Number(t.amount) : 0,
    }));

  const budgets: Budget[] = parsed.budgets.filter(
    (b): b is Budget =>
      Boolean(b && typeof b.categoryId === 'string' && Number.isFinite(Number(b.monthlyLimit)))
  ).map((b) => ({ ...b, monthlyLimit: Number(b.monthlyLimit) }));

  const recurringItems: RecurringItem[] = parsed.recurringItems.filter(
    (r): r is RecurringItem =>
      Boolean(r && typeof r.id === 'string' && typeof r.title === 'string' && Number.isFinite(Number(r.amount)))
  ).map((r) => ({ ...r, amount: Number(r.amount) }));

  const savingsGoals: SavingsGoal[] = parsed.savingsGoals.filter(
    (g): g is SavingsGoal =>
      Boolean(g && typeof g.id === 'string' && typeof g.title === 'string' && Number.isFinite(Number(g.targetAmount)))
  ).map((g) => ({ ...g, currentAmount: Number(g.currentAmount), targetAmount: Number(g.targetAmount) }));

  const ledgers = Array.isArray(parsed.ledgers)
    ? parsed.ledgers.filter((ledger): ledger is Ledger => Boolean(ledger &&
      typeof ledger.id === 'string' && typeof ledger.name === 'string' &&
      (ledger.kind === 'personal' || ledger.kind === 'household' || ledger.kind === 'business')))
    : undefined;
  const purchaseCandidates = Array.isArray(parsed.purchaseCandidates)
    ? parsed.purchaseCandidates.filter((item) => item && typeof item.id === 'string' &&
      typeof item.title === 'string' && typeof item.categoryId === 'string' &&
      typeof item.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(item.month) &&
      Number.isSafeInteger(item.amount) && item.amount > 0)
      .map((item) => {
        if (!item.foreignPrice) return item;
        const amount = estimatePurchaseJPY(item.foreignPrice);
        return amount === undefined ? { ...item, foreignPrice: undefined } : { ...item, amount };
      })
    : undefined;
  const readIds = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : undefined;
  const categoryOrder = { income: readIds(parsed.categoryOrder?.income), expense: readIds(parsed.categoryOrder?.expense) };
  const hiddenCategoryIds = readIds(parsed.hiddenCategoryIds);
  const ledgerOrder = readIds(parsed.ledgerOrder);

  return {
    ...(ledgers?.length ? { ledgers } : {}),
    ...(ledgerOrder?.length ? { ledgerOrder } : {}),
    ...(purchaseCandidates?.length ? { purchaseCandidates } : {}),
    ...(Array.isArray(parsed.customCategories) ? {
      customCategories: parsed.customCategories.filter((item) => item && typeof item.id === 'string' &&
        (item.id.startsWith('custom_') || ALL_CATEGORIES.some((category) => category.id === item.id && category.type === item.type)) &&
        typeof item.name === 'string' && item.name.trim() &&
        (item.type === 'expense' || item.type === 'income') && typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color)),
    } : {}),
    ...(categoryOrder.income || categoryOrder.expense ? { categoryOrder } : {}),
    ...(hiddenCategoryIds ? { hiddenCategoryIds } : {}),
    accounts,
    transactions,
    budgets,
    recurringItems,
    savingsGoals,
  };
}

const optionalNumbers = <T extends object>(row: T, keys: readonly (keyof T)[]) =>
  keys.every((key) => row[key] === undefined || Number.isFinite(row[key]));

const transactionNumbers = ['pointUsed', 'transferFee', 'withholdingTax', 'foreignGrossAmount', 'fxRate',
  'platformTransferFee', 'fxConversionFee', 'netJpyAmount', 'businessRatio'] as const;
const transactionText = ['memo', 'counterparty', 'accountingSubject', 'ledgerId', 'toAccountId'] as const;

export function isStoredTransaction(row: Transaction): boolean {
  return !!row && typeof row.id === 'string' && typeof row.date === 'string' && typeof row.title === 'string' &&
    typeof row.accountId === 'string' && typeof row.categoryId === 'string' &&
    (row.type === 'expense' || row.type === 'income' || row.type === 'transfer') && Number.isFinite(row.amount) &&
    optionalNumbers(row, transactionNumbers) && transactionText.every(key => row[key] === undefined || typeof row[key] === 'string');
}

/** Validate complete saved documents before migration or restore. Older valid numeric strings are accepted. */
export function requireFinanceState(payload: unknown): FinanceState {
  const invalid = () => new Error('家計データに読み取れない項目があります。');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalid();
  const raw = payload as Partial<FinanceState>;
  const state = sanitizeState(raw);
  if (!state) throw invalid();
  for (const key of ['accounts', 'transactions', 'budgets', 'recurringItems', 'savingsGoals',
    'customCategories', 'ledgers', 'purchaseCandidates'] as const) {
    const rows = raw[key];
    if (rows !== undefined && (!Array.isArray(rows) || rows.length !== (state[key]?.length ?? 0))) throw invalid();
    if (key !== 'budgets') {
      const ids = (state[key] ?? []).map((row) => row.id);
      if (new Set(ids).size !== ids.length) throw invalid();
    }
  }
  const numeric = (value: unknown) => typeof value === 'number' ? Number.isFinite(value)
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
  const numericMap = (values: unknown) => values === undefined || (
    values !== null && typeof values === 'object' && !Array.isArray(values) && Object.values(values).every(Number.isFinite)
  );
  const idList = (value: unknown) => value === undefined || (Array.isArray(value) && value.every(id => typeof id === 'string'));
  if (!idList(raw.ledgerOrder) || !idList(raw.hiddenCategoryIds) ||
      (raw.categoryOrder !== undefined && (!raw.categoryOrder || typeof raw.categoryOrder !== 'object' ||
      Array.isArray(raw.categoryOrder) || !idList(raw.categoryOrder.income) || !idList(raw.categoryOrder.expense)))) throw invalid();

  for (const row of raw.accounts!) {
    if (!numeric(row.initialBalance) || !VALID_ACCOUNT_TYPES.has(row.type) ||
        (row.usageScope !== undefined && !['personal', 'household', 'business'].includes(row.usageScope)) ||
        !optionalNumbers(row, ['creditLimit', 'closingDay', 'paymentDay', 'paymentMonthOffset', 'paymentWarningDays', 'fxRateToJpy']) ||
        !numericMap(row.confirmedBillings)) throw invalid();
  }
  for (let i = 0; i < state.transactions.length; i++) {
    const original = raw.transactions![i];
    const transaction = state.transactions[i];
    if (!numeric(original.amount) || original.type !== transaction.type || !isStoredTransaction(transaction)) throw invalid();
  }
  if (raw.budgets!.some(row => !numeric(row.monthlyLimit)) ||
      raw.recurringItems!.some(row => !numeric(row.amount) || !Number.isFinite(row.dayOfMonth)) ||
      raw.savingsGoals!.some(row => !numeric(row.currentAmount) || !numeric(row.targetAmount) || !optionalNumbers(row, ['monthlyContribution'])) ||
      raw.ledgers?.some(row => !numericMap(row.taxExemptions)) ||
      raw.purchaseCandidates?.some(row => row.foreignPrice && estimatePurchaseJPY(row.foreignPrice) === undefined)) throw invalid();
  // Retain additional top-level metadata in older exports when the known collections validate.
  return { ...raw, ...state };
}

export const legacyFinanceKeys = [STORAGE_KEY, 'kakeibo_finance_state_v2', 'kakeibo_finance_state_v1'] as const;

/** Only a missing key means "no data". Even an empty or unreadable newer value must protect older copies. */
export function readLegacyFinanceState(storage: { getItem(key: string): string | null }): FinanceState | null {
  for (const key of legacyFinanceKeys) {
    const raw = storage.getItem(key);
    if (raw !== null) return requireFinanceState(JSON.parse(raw));
  }
  return null;
}

export function loadInitialState(storage: { getItem(key: string): string | null }, fallback = () => createInitialSeedData(getCurrentMonthKey())): FinanceState {
  return readLegacyFinanceState(storage) ?? fallback();
}

export function createEmptyFinanceState(): FinanceState {
  return {
    accounts: [
      { id: 'acc_default_wallet', name: '財布（現金）', type: 'cash', usageScope: 'personal', initialBalance: 0 },
    ],
    transactions: [],
    budgets: [],
    recurringItems: [],
    savingsGoals: [],
  };
}
