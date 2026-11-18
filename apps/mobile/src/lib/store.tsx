import * as React from 'react';
import { kv } from '@/lib/kv';
import { createFinanceStoreHook, type StorageAdapter } from '@dmm/core/store/finance';
import { getCurrentMonthKey } from '@dmm/core/utils/format';
import type { Ledger, TransactionType } from '@dmm/core/types/finance';
import { filterLedger, getLedgers } from '@dmm/core/utils/ledgers';

const adapter: StorageAdapter = kv;

const useFinanceStore = createFinanceStoreHook(React, adapter);
type Store = ReturnType<typeof useFinanceStore> & {
  month: string;
  setMonth: React.Dispatch<React.SetStateAction<string>>;
  transactionFilter: 'all' | TransactionType;
  setTransactionFilter: (filter: 'all' | TransactionType) => void;
  showSavedTransaction: (date: string, type: TransactionType, ledgerId: string) => void;
  ledgers: readonly Ledger[];
  activeLedger: Ledger | undefined;
  setActiveLedgerId: (id: string | null) => void;
  visibleState: ReturnType<typeof useFinanceStore>['state'];
};

const Ctx = React.createContext<Store | null>(null);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const store = useFinanceStore();
  const [month, setMonth] = React.useState(getCurrentMonthKey);
  const [transactionFilter, setTransactionFilter] = React.useState<'all' | TransactionType>('all');
  const [activeLedgerId, setActiveLedgerId] = React.useState<string | null>(null);
  const ledgers = getLedgers(store.state);
  const activeLedger = ledgers.find((ledger) => ledger.id === activeLedgerId);
  const visibleState = React.useMemo(
    () => filterLedger(store.state, activeLedger?.id ?? null),
    [store.state, activeLedger?.id]
  );
  const showSavedTransaction = React.useCallback((date: string, type: TransactionType, ledgerId: string) => {
    setMonth(date.slice(0, 7));
    setTransactionFilter((filter) => filter === type ? filter : 'all');
    setActiveLedgerId((current) => current === null ? null : ledgerId);
  }, []);
  const value = {
    ...store, month, setMonth, transactionFilter, setTransactionFilter, showSavedTransaction,
    ledgers, activeLedger, setActiveLedgerId, visibleState,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFinance(): Store {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useFinance must be used inside <FinanceProvider>');
  return v;
}
