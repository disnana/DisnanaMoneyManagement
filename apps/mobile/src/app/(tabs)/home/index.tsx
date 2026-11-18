import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
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

  const stat = (label: string, value: string, color?: string) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '500' }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: color ?? '#fff', fontSize: 16, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );

  return (
    <Screen>
      <MonthBar month={month} onChange={setMonth} />

      <View style={{ backgroundColor: '#0F766E', borderRadius: 24, borderCurve: 'continuous', padding: 20 }}>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' }}>総資産残高</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] }}>
          {formatJPY(totalAssets)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.18)' }}>
          {stat('収入', formatJPY(m.income))}
          {stat('支出', formatJPY(m.expense))}
          {stat('収支', `${m.net >= 0 ? '+' : ''}${formatJPY(m.net)}`, m.net >= 0 ? '#A7F3D0' : '#FECACA')}
        </View>
      </View>

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
