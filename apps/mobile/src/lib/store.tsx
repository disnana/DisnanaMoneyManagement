import * as React from 'react';
import { Alert, Platform } from 'react-native';
import { financeStorage } from './financeStorage';
import { FinanceRecovery } from '@/ui/FinanceRecovery';
import { createFinanceLoader } from '@dmm/core/store/financeLoader';
import { createEmptyFinanceState, createFinanceStoreHook } from '@dmm/core/store/finance';
import { getCurrentMonthKey } from '@dmm/core/utils/format';
import type { FinanceState, Ledger, TransactionType } from '@dmm/core/types/finance';
import { filterLedger, getLedgers } from '@dmm/core/utils/ledgers';

function newLedger() {
  const empty = createEmptyFinanceState();
  empty.accounts.push({ id: 'acc_default_bank', name: '銀行口座', type: 'bank', usageScope: 'personal', initialBalance: 0 });
  return empty;
}
const useLoadFinance = createFinanceLoader(React, financeStorage, newLedger);
const useFinanceStore = createFinanceStoreHook(React, financeStorage, newLedger);
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
  const { result, retry, restore } = useLoadFinance();
  if (result.status !== 'ready') return <FinanceRecovery loading={result.status === 'loading'} retry={retry} restore={restore} />;
  return <LoadedFinanceProvider initial={result.state}>{children}</LoadedFinanceProvider>;
}

function LoadedFinanceProvider({ initial, children }: { initial: FinanceState; children: React.ReactNode }) {
  const store = useFinanceStore(initial);
  const { writeError, dismissWriteError } = store;
  React.useEffect(() => {
    if (!writeError) return;
    if (Platform.OS === 'web') {
      window.alert(writeError);
      dismissWriteError();
    } else {
      Alert.alert('家計データの保存', writeError, [{ text: '閉じる', onPress: dismissWriteError }]);
    }
  }, [writeError, dismissWriteError]);
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
