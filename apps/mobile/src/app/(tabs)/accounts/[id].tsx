import { useMemo } from 'react';
import { Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { MonthBar, Screen } from '@/ui/kit';
import { TxGroups } from '@/ui/TxGroups';

/** One account: current balance and its transactions for the selected month. */
export default function AccountDetail() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, accountBalances, month, setMonth } = useFinance();
  const account = state.accounts.find((a) => a.id === id);
  const list = useMemo(
    () => state.transactions.filter((t) => (t.accountId === id || t.toAccountId === id) && t.date.slice(0, 7) === month),
    [state.transactions, id, month]
  );
  const bal = accountBalances[id] ?? 0;
  return (
    <>
      <Stack.Screen options={{ title: account?.name ?? '口座' }} />
      <Screen>
        <Text style={{ color: p.textSecondary, fontSize: 13, textAlign: 'center' }}>現在の残高</Text>
        <Text style={{ color: bal < 0 ? p.danger : p.text, fontSize: 34, fontWeight: '800', textAlign: 'center', marginTop: -14, fontVariant: ['tabular-nums'] }}>
          {formatJPY(bal)}
        </Text>
        <MonthBar month={month} onChange={setMonth} />
        <TxGroups transactions={list} empty="この月の取引はありません" />
      </Screen>
    </>
  );
}
