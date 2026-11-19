import { useMemo } from 'react';
import { computeAccountBalances } from '@dmm/core/store/finance';
import { getTodayString } from '@dmm/core/utils/format';
import { useFinance } from './store';

export function useCurrentBalances() {
  const { state, accountBalances } = useFinance();
  const today = getTodayString();
  return useMemo(() => {
    const transactions = state.transactions.filter((item) => item.date <= today);
    return transactions.length === state.transactions.length
      ? accountBalances : computeAccountBalances({ ...state, transactions });
  }, [state, accountBalances, today]);
}
