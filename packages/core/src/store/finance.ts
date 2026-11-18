import {
  Account,
  Budget,
  FinanceState,
  RecurringItem,
  SavingsGoal,
  Transaction,
} from '../types/finance';
import { createInitialSeedData } from '../data/seedData';
import {
  getCurrentMonthKey,
  getEffectiveOutflow,
  getTransferTotalFees,
} from '../utils/format';

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

  if (accounts.length === 0) return null;

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
  );

  const recurringItems: RecurringItem[] = parsed.recurringItems.filter(
    (r): r is RecurringItem =>
      Boolean(r && typeof r.id === 'string' && typeof r.title === 'string' && Number.isFinite(Number(r.amount)))
  );

  const savingsGoals: SavingsGoal[] = parsed.savingsGoals.filter(
    (g): g is SavingsGoal =>
      Boolean(g && typeof g.id === 'string' && typeof g.title === 'string' && Number.isFinite(Number(g.targetAmount)))
  );

  return {
    accounts,
    transactions,
    budgets,
    recurringItems,
    savingsGoals,
  };
}

/** Minimal synchronous key-value storage (localStorage on web, expo-sqlite/kv-store on mobile). */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadInitialState(storage: StorageAdapter): FinanceState {
  try {
    const raw =
      storage.getItem(STORAGE_KEY) ??
      storage.getItem('kakeibo_finance_state_v2') ??
      storage.getItem('kakeibo_finance_state_v1');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FinanceState>;
      const sanitized = sanitizeState(parsed);
      if (sanitized) {
        return sanitized;
      }
    }
  } catch {
    // Fallback to seed data
  }
  return createInitialSeedData(getCurrentMonthKey());
}


/** Per-account balance. Debit-card spending is deducted from the linked bank account. */
export function computeAccountBalances(state: FinanceState): Record<string, number> {

    const map: Record<string, number> = {};
    const accountById: Record<string, Account> = {};
    for (const acc of state.accounts) {
      map[acc.id] = acc.initialBalance;
      accountById[acc.id] = acc;
    }

    for (const tx of state.transactions) {
      const acc = accountById[tx.accountId];
      if (tx.type === 'income') {
        const targetId =
          acc?.type === 'debit' &&
          acc.linkedBankAccountId &&
          map[acc.linkedBankAccountId] !== undefined
            ? acc.linkedBankAccountId
            : tx.accountId;
        if (map[targetId] !== undefined) {
          const netReceived = Math.max(0, tx.amount - (tx.withholdingTax ?? 0));
          map[targetId] += netReceived;
        }
      } else if (tx.type === 'expense') {
        const targetId =
          acc?.type === 'debit' &&
          acc.linkedBankAccountId &&
          map[acc.linkedBankAccountId] !== undefined
            ? acc.linkedBankAccountId
            : tx.accountId;
        if (map[targetId] !== undefined) {
          map[targetId] -= getEffectiveOutflow(tx);
        }
      } else if (tx.type === 'transfer') {
        if (map[tx.accountId] !== undefined) {
          map[tx.accountId] -= tx.amount + getTransferTotalFees(tx);
        }
        if (tx.toAccountId && map[tx.toAccountId] !== undefined) {
          map[tx.toAccountId] += tx.amount;
        }
      }
    }
    return map;
  }

/** React is injected so this package never bundles its own copy (web and RN each pass theirs). */
export interface ReactHooks {
  useState<S>(initial: S | (() => S)): [S, (value: S | ((prev: S) => S)) => void];
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]): T;
}

export function createFinanceStoreHook(react: ReactHooks, storage: StorageAdapter) {
  const { useState, useEffect, useMemo, useCallback } = react;

  return function useFinanceStore() {
  const [state, setState] = useState<FinanceState>(() => loadInitialState(storage));

  useEffect(() => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  const accountBalances = useMemo(() => computeAccountBalances(state), [state.accounts, state.transactions]);

  const totalAssets = useMemo(() => {
    return Object.values(accountBalances).reduce((sum, val) => sum + val, 0);
  }, [accountBalances]);

  const accountNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const acc of state.accounts) {
      map[acc.id] = acc.name;
    }
    return map;
  }, [state.accounts]);

  const addTransaction = useCallback((tx: Omit<Transaction, 'id'>) => {
    const id = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setState((prev) => ({
      ...prev,
      transactions: [{ ...tx, id }, ...prev.transactions],
    }));
  }, []);

  const addTransactionsBatch = useCallback((items: Omit<Transaction, 'id'>[]) => {
    const now = Date.now();
    const created: Transaction[] = items.map((tx, idx) => ({
      ...tx,
      id: `tx_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    }));
    setState((prev) => ({
      ...prev,
      transactions: [...created, ...prev.transactions],
    }));
  }, []);

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Omit<Transaction, 'id'>>) => {
      setState((prev) => ({
        ...prev,
        transactions: prev.transactions.map((tx) =>
          tx.id === id ? { ...tx, ...patch } : tx
        ),
      }));
    },
    []
  );

  const deleteTransaction = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((tx) => tx.id !== id),
    }));
  }, []);

  const deleteSettlementGroup = useCallback((groupId: string) => {
    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((tx) => tx.settlementGroupId !== groupId),
    }));
  }, []);

  const addAccount = useCallback((acc: Omit<Account, 'id'>) => {
    const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setState((prev) => ({
      ...prev,
      accounts: [...prev.accounts, { ...acc, id }],
    }));
  }, []);

  const updateAccount = useCallback(
    (id: string, patch: Partial<Omit<Account, 'id'>>) => {
      setState((prev) => ({
        ...prev,
        accounts: prev.accounts.map((acc) =>
          acc.id === id ? { ...acc, ...patch } : acc
        ),
      }));
    },
    []
  );

  const deleteAccount = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((acc) => acc.id !== id),
    }));
  }, []);

  const upsertBudget = useCallback((budget: Budget) => {
    setState((prev) => {
      const exists = prev.budgets.some((b) => b.categoryId === budget.categoryId);
      const nextBudgets = exists
        ? prev.budgets.map((b) =>
            b.categoryId === budget.categoryId ? budget : b
          )
        : [...prev.budgets, budget];
      return { ...prev, budgets: nextBudgets };
    });
  }, []);

  const removeBudget = useCallback((categoryId: string) => {
    setState((prev) => ({
      ...prev,
      budgets: prev.budgets.filter((b) => b.categoryId !== categoryId),
    }));
  }, []);

  const addRecurringItem = useCallback((item: Omit<RecurringItem, 'id'>) => {
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setState((prev) => ({
      ...prev,
      recurringItems: [...prev.recurringItems, { ...item, id }],
    }));
  }, []);

  const deleteRecurringItem = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      recurringItems: prev.recurringItems.filter((r) => r.id !== id),
    }));
  }, []);

  const recordRecurringForMonth = useCallback(
    (item: RecurringItem, monthKey: string) => {
      const dayStr = String(Math.min(Math.max(item.dayOfMonth, 1), 28)).padStart(
        2,
        '0'
      );
      const date = `${monthKey}-${dayStr}`;
      const id = `tx_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setState((prev) => ({
        ...prev,
        transactions: [
          {
            id,
            type: item.type,
            amount: item.amount,
            date,
            categoryId: item.categoryId,
            accountId: item.accountId,
            title: item.title,
            recurringId: item.id,
            scope: item.scope ?? 'personal',
            accountingSubject: item.accountingSubject,
            businessRatio: item.scope === 'business' ? 100 : 0,
          },
          ...prev.transactions,
        ],
      }));
    },
    []
  );

  const addSavingsGoal = useCallback((goal: Omit<SavingsGoal, 'id'>) => {
    const id = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setState((prev) => ({
      ...prev,
      savingsGoals: [...prev.savingsGoals, { ...goal, id }],
    }));
  }, []);

  const deleteSavingsGoal = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      savingsGoals: prev.savingsGoals.filter((g) => g.id !== id),
    }));
  }, []);

  const contributeToGoal = useCallback((id: string, delta: number) => {
    setState((prev) => ({
      ...prev,
      savingsGoals: prev.savingsGoals.map((g) =>
        g.id === id
          ? { ...g, currentAmount: Math.max(0, g.currentAmount + delta) }
          : g
      ),
    }));
  }, []);

  const importState = useCallback((newState: FinanceState) => {
    setState(newState);
  }, []);

  const resetToSampleData = useCallback(() => {
    setState(createInitialSeedData(getCurrentMonthKey()));
  }, []);

  const clearAllData = useCallback(() => {
    setState({
      accounts: [
        {
          id: 'acc_default_wallet',
          name: '財布（現金）',
          type: 'cash',
          usageScope: 'personal',
          initialBalance: 0,
        },
      ],
      transactions: [],
      budgets: [],
      recurringItems: [],
      savingsGoals: [],
    });
  }, []);

  return {
    state,
    accountBalances,
    totalAssets,
    accountNameMap,
    addTransaction,
    addTransactionsBatch,
    updateTransaction,
    deleteTransaction,
    deleteSettlementGroup,
    addAccount,
    updateAccount,
    deleteAccount,
    upsertBudget,
    removeBudget,
    addRecurringItem,
    deleteRecurringItem,
    recordRecurringForMonth,
    addSavingsGoal,
    deleteSavingsGoal,
    contributeToGoal,
    importState,
    resetToSampleData,
    clearAllData,
  };
}
}
