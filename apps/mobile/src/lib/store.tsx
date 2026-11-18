import * as React from 'react';
import { kv } from '@/lib/kv';
import { createFinanceStoreHook, type StorageAdapter } from '@dmm/core/store/finance';
import { getCurrentMonthKey } from '@dmm/core/utils/format';

const adapter: StorageAdapter = kv;

const useFinanceStore = createFinanceStoreHook(React, adapter);
type Store = ReturnType<typeof useFinanceStore> & {
  month: string;
  setMonth: (m: string) => void;
};

const Ctx = React.createContext<Store | null>(null);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const store = useFinanceStore();
  const [month, setMonth] = React.useState(getCurrentMonthKey);
  const value = React.useMemo(() => ({ ...store, month, setMonth }), [store, month]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFinance(): Store {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useFinance must be used inside <FinanceProvider>');
  return v;
}
