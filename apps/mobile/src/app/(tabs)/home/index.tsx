import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { HeroCard } from '@/ui/HeroCard';
import { Group, MonthBar, Screen, SectionTitle } from '@/ui/kit';
import { TxRow } from '@/ui/TxRow';

export default function Home() {
  const p = usePalette();
  const { state, totalAssets, month, setMonth } = useFinance();
  const m = computeMonthMetrics(state, month);
  const recent = state.transactions
    .filter((t) => t.date.slice(0, 7) === month)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  return (
    <Screen>
      <MonthBar month={month} onChange={setMonth} />

      <HeroCard />

      <SectionTitle action="すべて" onAction={() => router.navigate('/transactions')}>主な取引</SectionTitle>
      {recent.length === 0 ? (
        <Group>
          <View style={{ padding: 28, alignItems: 'center' }}>
            <Text style={{ color: p.textSecondary }}>この月の取引はまだありません</Text>
          </View>
        </Group>
      ) : (
        <Group>
          {recent.map((tx) => (
            <TxRow key={tx.id} tx={tx} showDate />
          ))}
        </Group>
      )}
    </Screen>
  );
}
