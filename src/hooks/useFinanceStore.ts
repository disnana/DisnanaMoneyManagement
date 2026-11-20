import * as React from 'react';
import type { FinanceState } from '@dmm/core/types/finance';
import { createInitialSeedData } from '@dmm/core/data/seedData';
import { getCurrentMonthKey } from '@dmm/core/utils/format';
import { createFinanceStoreHook } from '@dmm/core/store/finance';
import { createFinanceLoader } from '@dmm/core/store/financeLoader';
import { createBrowserFinanceStorage } from '@dmm/core/store/browserFinanceStorage';

const storage = createBrowserFinanceStorage();
const useLoadedStore = createFinanceStoreHook(React, storage);
export const useFinanceLoader = createFinanceLoader(React, storage, () => createInitialSeedData(getCurrentMonthKey()));
export const InitialFinanceState = React.createContext<FinanceState | null>(null);

export function useFinanceStore() {
  const initial = React.useContext(InitialFinanceState);
  if (initial === null) throw new Error('家計データの読み込みが必要です。');
  return useLoadedStore(initial);
}
