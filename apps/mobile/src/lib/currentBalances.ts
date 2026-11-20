import { useMemo } from 'react';
import { computeAccountBalances } from '@dmm/core/store/finance';
import { getTodayString } from '@dmm/core/utils/format';
import { useFinance } from './store';

export function useCurrentBalances() {
  const { state, accountBalances } = useFinance();
  const today = getTodayString();
  return useMemo(() => {
    if (!state.transactions.some((item) => item.date > today)) return accountBalances;
    return computeAccountBalances({
      accounts: state.accounts,
      transactions: state.transactions.filter((item) => item.date <= today),
    });
  }, [state.accounts, state.transactions, accountBalances, today]);
}
