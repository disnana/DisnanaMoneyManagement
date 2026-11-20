import { useMemo } from 'react';
import { computeAccountBalances } from '@dmm/core/store/finance';
import { getTodayString } from '@dmm/core/utils/format';
import { useFinance } from './store';

const currentBalances = new WeakMap<Record<string, number>, { date: string; balances: Record<string, number> }>();

export function useCurrentBalances() {
  const { state, accountBalances } = useFinance();
  const today = getTodayString();
  return useMemo(() => {
    const saved = currentBalances.get(accountBalances);
    if (saved?.date === today) return saved.balances;
    const balances = state.transactions.some((item) => item.date > today)
      ? computeAccountBalances({
        accounts: state.accounts,
        transactions: state.transactions.filter((item) => item.date <= today),
      })
      : accountBalances;
    currentBalances.set(accountBalances, { date: today, balances });
    return balances;
  }, [state.accounts, state.transactions, accountBalances, today]);
}
