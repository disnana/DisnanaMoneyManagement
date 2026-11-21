import {
  Account,
  Budget,
  CategoryDef,
  FinanceState,
  Ledger,
  PurchaseCandidate,
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
import { getLedgers, getTransactionLedger, removeLedger } from '../utils/ledgers';
import type { TransactionChange } from './financeDatabase';
import { buildPurchaseTransaction, markPurchased } from '../utils/purchasePlan';
import { buildReimbursementTx } from '../utils/advances';
import { createEmptyFinanceState } from './financeState';
import { appendMonemyRows, type planMonemyImport } from '../utils/monemyImport';
import { appendStatementCsvRows, type planStatementCsvImport } from '../utils/bankCsvImport';

export { STORAGE_KEY, sanitizeState, requireFinanceState, legacyFinanceKeys, readLegacyFinanceState, loadInitialState, createEmptyFinanceState } from './financeState';

export interface FinanceStorage {
  loadState(): FinanceState | null | Promise<FinanceState | null>;
  saveState(state: FinanceState, change?: TransactionChange): void | Promise<void>;
  /** Called only after the user confirms recovery from a backup on the load-error screen. */
  replaceState(state: FinanceState): void | Promise<void>;
  clearLegacyCopies?(): void | Promise<void>;
}

/** Per-account balance. Debit-card spending is deducted from the linked bank account. */
export function computeAccountBalances(state: Pick<FinanceState, 'accounts' | 'transactions'>): Record<string, number> {

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
          map[tx.accountId] -= getEffectiveOutflow(tx) + getTransferTotalFees(tx);
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
  useRef<T>(initial: T): { current: T };
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]): T;
}

const writeFailed = '家計データを保存できませんでした。空き容量や保存先を確認して、もう一度お試しください。';

class FinanceInputError extends Error {}

/** All mutations, including compound transactions, are published to React only after their write commits. */
export function createFinanceStoreHook(react: ReactHooks, storage: FinanceStorage, emptyState = createEmptyFinanceState) {
  const { useState, useMemo, useCallback, useRef } = react;

  return function useFinanceStore(loaded: FinanceState) {
  const [state, setRenderedState] = useState(loaded);
  const [writeError, setWriteError] = useState<string | null>(null);
  const latestState = useRef(state);
  const queue = useRef(Promise.resolve());
  const dismissWriteError = useCallback(() => setWriteError(null), []);
  type Update = FinanceState | ((previous: FinanceState) => FinanceState);
  const persist = useCallback((update: Update, id?: string) => {
    const job = queue.current.then(async () => {
      const before = latestState.current;
      const next = typeof update === 'function' ? update(before) : update;
      if (next === before) return;
      try {
        await storage.saveState(next, id === undefined ? undefined : { before, id });
      } catch (error) {
        if (error instanceof Error && error.name === 'FinanceConflictError') {
          const current = await storage.loadState();
          if (current) {
            latestState.current = current;
            setRenderedState(current);
          }
          throw new FinanceInputError('ほかの画面で家計データが更新されました。最新の内容を確認してから再試行してください。');
        }
        throw new Error(writeFailed, { cause: error });
      }
      latestState.current = next;
      setRenderedState(next);
    });
    // A rejected write must not poison the queue or become the base of the next edit.
    queue.current = job.catch(() => {});
    return job;
  }, []);
  const setState = useCallback(async (update: Update, id?: string) => {
    try {
      await persist(update, id);
      return true;
    } catch (error) {
      setWriteError(error instanceof FinanceInputError ? error.message : writeFailed);
      return false;
    }
  }, [persist]);

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
    return setState((prev) => ({
      ...prev,
      transactions: [{ ...tx, id }, ...prev.transactions],
    }), id);
  }, []);

  const addTransactionsBatch = useCallback((items: Omit<Transaction, 'id'>[]) => {
    const now = Date.now();
    const created: Transaction[] = items.map((tx, idx) => ({
      ...tx,
      id: `tx_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    }));
    return setState((prev) => ({
      ...prev,
      transactions: [...created, ...prev.transactions],
    }));
  }, []);

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Omit<Transaction, 'id'>>) => {
      return setState((prev) => {
        const index = prev.transactions.findIndex((tx) => tx.id === id);
        if (index < 0) throw new FinanceInputError('この取引はすでに削除されています。');
        const transactions = prev.transactions.slice();
        transactions[index] = { ...transactions[index], ...patch };
        return { ...prev, transactions };
      }, id);
    },
    []
  );

  const deleteTransaction = useCallback((id: string) => {
    return setState((prev) => {
      const transactions = prev.transactions.filter((tx) => tx.id !== id);
      return transactions.length === prev.transactions.length ? prev : { ...prev, transactions };
    }, id);
  }, []);

  const deleteSettlementGroup = useCallback((groupId: string) => {
    return setState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((tx) => tx.settlementGroupId !== groupId),
    }));
  }, []);

  const addAccount = useCallback((acc: Omit<Account, 'id'>) => {
    const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    return setState((prev) => ({
      ...prev,
      accounts: [...prev.accounts, { ...acc, id }],
    }));
  }, []);

  const updateAccount = useCallback(
    (id: string, patch: Partial<Omit<Account, 'id'>>) => {
      return setState((prev) => {
        const accounts = prev.accounts.map((acc) => acc.id === id ? { ...acc, ...patch } : acc);
        if (!patch.ledgerId) return { ...prev, accounts };
        const ledgers = getLedgers(prev);
        const previousAccounts = new Map(prev.accounts.map((acc) => [acc.id, acc]));
        const transactions = prev.transactions.map((tx) => tx.accountId === id && !tx.ledgerId
          ? { ...tx, ledgerId: getTransactionLedger(tx, previousAccounts, ledgers).id }
          : tx);
        return { ...prev, accounts, transactions };
      });
    },
    []
  );

  const deleteAccount = useCallback((id: string) => {
    return setState((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((acc) => acc.id !== id),
    }));
  }, []);

  const setConfirmedCardBilling = useCallback((id: string, month: string, amount?: number) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      (amount !== undefined && (!Number.isSafeInteger(amount) || amount < 0))) return Promise.resolve(false);
    return setState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((account) => {
        if (account.id !== id || account.type !== 'credit') return account;
        const confirmedBillings = { ...account.confirmedBillings };
        if (amount === undefined) delete confirmedBillings[month];
        else confirmedBillings[month] = amount;
        return { ...account, confirmedBillings };
      }),
    }));
  }, []);

  const saveCustomCategory = useCallback((category: Omit<CategoryDef, 'id'>, existingId?: string) => {
    const id = existingId ?? `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return setState((prev) => {
      const categories = prev.customCategories ?? [];
      return {
        ...prev, customCategories: categories.some((item) => item.id === id)
          ? categories.map((item) => item.id === id ? { ...category, id } : item)
          : [...categories, { ...category, id }],
      };
    });
  }, []);

  const setCategoryOrder = useCallback((type: 'expense' | 'income', ids: string[]) => {
    return setState((prev) => ({ ...prev, categoryOrder: { ...prev.categoryOrder, [type]: [...new Set(ids)] } }));
  }, []);

  /** Reorder accounts: the given ids first in that order, anything not listed keeps its relative order after them. */
  const reorderAccounts = useCallback((ids: string[]) => {
    return setState((prev) => {
      const rank = new Map(ids.map((id, i) => [id, i]));
      const accounts = [...prev.accounts].sort((a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length));
      return { ...prev, accounts };
    });
  }, []);

  const setCategoryHidden = useCallback((id: string, hidden: boolean) => {
    return setState((prev) => {
      const ids = new Set(prev.hiddenCategoryIds);
      if (hidden) ids.add(id);
      else ids.delete(id);
      return { ...prev, hiddenCategoryIds: [...ids] };
    });
  }, []);

  const setLedgerOrder = useCallback((ids: string[]) => {
    return setState((prev) => {
      const existing = new Set(getLedgers(prev).map((ledger) => ledger.id));
      return { ...prev, ledgerOrder: [...new Set(ids.filter((id) => existing.has(id)))] };
    });
  }, []);

  const addLedger = useCallback(async (name: string, kind: Ledger['kind'], appearance?: Pick<Ledger, 'icon' | 'color'>) => {
    const id = `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const saved = await setState((prev) => ({ ...prev, ledgers: [...getLedgers(prev), { id, name, kind, ...appearance }] }));
    return saved ? id : null;
  }, []);

  const updateLedger = useCallback((id: string, changes: Partial<Pick<Ledger, 'name' | 'icon' | 'color'>>) => {
    return setState((prev) => ({
      ...prev,
      ledgers: getLedgers(prev).map((ledger) => ledger.id === id ? { ...ledger, ...changes } : ledger),
    }));
  }, []);

  const deleteLedger = useCallback((id: string, destinationId: string) => {
    return setState((prev) => removeLedger(prev, id, destinationId));
  }, []);

  const setLedgerTaxExemption = useCallback((id: string, year: number, amount?: number) => {
    if (!Number.isInteger(year) || year < 1000 || year > 9999 ||
      (amount !== undefined && (!Number.isSafeInteger(amount) || amount < 0))) return Promise.resolve(false);
    return setState((prev) => ({
      ...prev,
      ledgers: getLedgers(prev).map((ledger) => {
        if (ledger.id !== id) return ledger;
        const taxExemptions = { ...ledger.taxExemptions };
        if (amount === undefined) delete taxExemptions[year];
        else taxExemptions[year] = amount;
        return { ...ledger, taxExemptions };
      }),
    }));
  }, []);

  const upsertBudget = useCallback((budget: Budget) => {
    return setState((prev) => {
      const matches = (b: Budget) => b.categoryId === budget.categoryId && b.ledgerId === budget.ledgerId;
      const exists = prev.budgets.some(matches);
      const nextBudgets = exists
        ? prev.budgets.map((b) => matches(b) ? budget : b)
        : [...prev.budgets, budget];
      return { ...prev, budgets: nextBudgets };
    });
  }, []);

  const removeBudget = useCallback((categoryId: string, ledgerId?: string) => {
    return setState((prev) => ({
      ...prev,
      budgets: prev.budgets.filter((b) => b.categoryId !== categoryId || b.ledgerId !== ledgerId),
    }));
  }, []);

  const addRecurringItem = useCallback((item: Omit<RecurringItem, 'id'>) => {
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    return setState((prev) => ({
      ...prev,
      recurringItems: [...prev.recurringItems, { ...item, id }],
    }));
  }, []);

  const deleteRecurringItem = useCallback((id: string) => {
    return setState((prev) => ({
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
      return setState((prev) => {
        if (prev.transactions.some((tx) => tx.recurringId === item.id && tx.date.startsWith(monthKey + '-'))) {
          throw new FinanceInputError('この月の定期項目はすでに記録されています。');
        }
        const transaction: Transaction = {
          id, type: item.type, amount: item.amount, date, categoryId: item.categoryId, accountId: item.accountId,
          title: item.title, recurringId: item.id, scope: item.scope ?? 'personal',
          accountingSubject: item.accountingSubject, businessRatio: item.scope === 'business' ? 100 : 0,
        };
        return { ...prev, transactions: [transaction, ...prev.transactions] };
      }, id);
    },
    []
  );

  const addSavingsGoal = useCallback((goal: Omit<SavingsGoal, 'id'>) => {
    const id = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    return setState((prev) => ({
      ...prev,
      savingsGoals: [...prev.savingsGoals, { ...goal, id }],
    }));
  }, []);

  const deleteSavingsGoal = useCallback((id: string) => {
    return setState((prev) => ({
      ...prev,
      savingsGoals: prev.savingsGoals.filter((g) => g.id !== id),
    }));
  }, []);

  const updateSavingsGoal = useCallback((id: string, patch: Partial<Omit<SavingsGoal, 'id' | 'currentAmount'>>) => {
    return setState((prev) => ({
      ...prev,
      savingsGoals: prev.savingsGoals.map((goal) => goal.id === id ? { ...goal, ...patch } : goal),
    }));
  }, []);

  const savePurchaseCandidate = useCallback((item: Omit<PurchaseCandidate, 'id'>, existingId?: string) => {
    const id = existingId ?? `purchase_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return setState((prev) => {
      const items = prev.purchaseCandidates ?? [];
      return {
        ...prev,
        purchaseCandidates: existingId
          ? items.map((candidate) => candidate.id === existingId ? { ...item, id } : candidate)
          : [...items, { ...item, id }],
      };
    });
  }, []);

  const removePurchaseCandidate = useCallback((id: string) => {
    return setState((prev) => ({
      ...prev,
      purchaseCandidates: prev.purchaseCandidates?.filter((item) => item.id !== id),
    }));
  }, []);

  const contributeToGoal = useCallback((id: string, delta: number) => {
    return setState((prev) => ({
      ...prev,
      savingsGoals: prev.savingsGoals.map((g) =>
        g.id === id
          ? { ...g, currentAmount: Math.max(0, g.currentAmount + delta) }
          : g
      ),
    }));
  }, []);

  const reimburseAdvance = useCallback((id: string, accountId: string, date: string) =>
    setState((prev) => {
      const advance = prev.transactions.find((row) => row.id === id);
      if (!advance?.advance || advance.type !== 'expense' || advance.advance.reimbursedAt) {
        throw new FinanceInputError('この立替は回収できる状態ではありません。');
      }
      const accounts = new Map(prev.accounts.map((account) => [account.id, account]));
      if (!accounts.has(accountId)) throw new FinanceInputError('回収先の口座を確認してください。');
      const ledgerId = getTransactionLedger(advance, accounts, getLedgers(prev)).id;
      const income = { ...buildReimbursementTx({ ...advance, ledgerId }, accountId, date),
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
      const settled = { ...advance, advance: { ...advance.advance, reimbursedAt: date, reimbursementTxId: income.id } };
      return { ...prev, transactions: [income, ...prev.transactions.map((row) => row === advance ? settled : row)] };
    }), [setState]);

  const recordPurchase = useCallback((id: string, accountId: string, date: string) =>
    setState((prev) => {
      const candidates = prev.purchaseCandidates ?? [];
      const candidate = candidates.find((item) => item.id === id);
      if (!candidate || candidate.status === 'purchased') throw new FinanceInputError('この購入はすでに処理されています。');
      if (!prev.accounts.some((account) => account.id === accountId)) throw new FinanceInputError('支払い口座を確認してください。');
      const expense = { ...buildPurchaseTransaction(candidate, accountId, date),
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
      return {
        ...prev, transactions: [expense, ...prev.transactions],
        purchaseCandidates: candidates.map((item) => item === candidate ? { ...markPurchased(item, date), id } : item),
      };
    }), [setState]);

  const commitCsvImport = useCallback((source: FinanceState, append: () => FinanceState) => persist((prev) => {
    if (source !== prev) throw new FinanceInputError('家計データが変わりました。プレビューを確認し直してください。');
    return append();
  }), [persist]);
  const importMonemyRows = useCallback((plan: ReturnType<typeof planMonemyImport>) =>
    commitCsvImport(plan.source, () => appendMonemyRows(plan)), [commitCsvImport]);
  const importStatementCsvRows = useCallback((plan: ReturnType<typeof planStatementCsvImport>) =>
    commitCsvImport(plan.source, () => appendStatementCsvRows(plan)), [commitCsvImport]);

  const importState = useCallback((next: FinanceState) => setState(next), [setState]);
  const restoreBackup = useCallback((next: FinanceState) => persist(next), [persist]);

  const reset = useCallback(async (next: FinanceState) => {
    if (!await setState(next)) return false;
    try {
      await storage.clearLegacyCopies?.();
    } catch {
      setWriteError('家計データは置き換わりましたが、移行前のコピーを削除できませんでした。再試行してください。');
      return false;
    }
    return true;
  }, [setState]);
  const resetToSampleData = useCallback(() => reset(createInitialSeedData(getCurrentMonthKey())), [reset]);
  const clearAllData = useCallback(() => reset(emptyState()), [reset]);

  return {
    state, writeError, dismissWriteError,
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
    setConfirmedCardBilling,
    saveCustomCategory,
    setCategoryOrder,
    reorderAccounts,
    setCategoryHidden,
    addLedger,
    setLedgerOrder,
    updateLedger,
    deleteLedger,
    setLedgerTaxExemption,
    upsertBudget,
    removeBudget,
    addRecurringItem,
    deleteRecurringItem,
    recordRecurringForMonth,
    addSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    contributeToGoal,
    savePurchaseCandidate,
    removePurchaseCandidate,
    reimburseAdvance, recordPurchase, restoreBackup,
    importState,
    importMonemyRows, importStatementCsvRows,
    resetToSampleData,
    clearAllData,
  };
}
}
