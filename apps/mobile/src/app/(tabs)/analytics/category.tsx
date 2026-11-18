import { useMemo } from 'react';
import { Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { MonthBar, Screen } from '@/ui/kit';
import { TxGroups } from '@/ui/TxGroups';

/** Everything in one category for the selected month. */
export default function CategoryDetail() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, month, setMonth } = useFinance();
  const cat = getCategoryById(id);
  const list = useMemo(
    () => state.transactions.filter((t) => t.categoryId === id && t.date.slice(0, 7) === month),
    [state.transactions, id, month]
  );
  const total = list.reduce((s, t) => s + t.amount, 0);
  return (
    <>
      <Stack.Screen options={{ title: cat.name }} />
      <Screen>
        <MonthBar month={month} onChange={setMonth} />
        <Text style={{ color: p.text, fontSize: 32, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] }}>{formatJPY(total)}</Text>
        <TxGroups transactions={list} empty="この月の取引はありません" />
      </Screen>
    </>
  );
}
