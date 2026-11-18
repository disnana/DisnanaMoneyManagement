import { useMemo } from 'react';
import { Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { MonthScreen } from '@/ui/MonthScreen';
import { TxGroups } from '@/ui/TxGroups';

/** Everything in one category for the selected month. */
export default function CategoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cat = getCategoryById(id);
  return (
    <>
      <Stack.Screen options={{ title: cat.name }} />
      <MonthScreen>{(month, isPreview) => <CategoryMonth id={id} month={month} isPreview={isPreview} />}</MonthScreen>
    </>
  );
}

function CategoryMonth({ id, month, isPreview }: { id: string; month: string; isPreview: boolean }) {
  const p = usePalette();
  const { visibleState } = useFinance();
  const list = useMemo(
    () => visibleState.transactions.filter((t) => t.categoryId === id && t.date.slice(0, 7) === month),
    [visibleState.transactions, id, month]
  );
  const total = list.reduce((s, t) => s + t.amount, 0);
  return (
    <>
      <Text style={{ color: p.text, fontSize: 32, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] }}>{formatJPY(total)}</Text>
      <TxGroups transactions={isPreview ? list.slice(0, 12) : list} empty="この月の取引はありません" />
    </>
  );
}
