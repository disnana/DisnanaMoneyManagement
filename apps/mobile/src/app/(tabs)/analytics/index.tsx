import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { categoryIcon } from '@/lib/categoryIcons';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { DonutChart } from '@/ui/PieChart';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { Group, IconBadge, SectionTitle } from '@/ui/kit';
import { MonthScreen } from '@/ui/MonthScreen';

export default function Analytics() {
  return <MonthScreen>{(month) => <AnalyticsMonth month={month} />}</MonthScreen>;
}

function AnalyticsMonth({ month }: { month: string }) {
  const p = usePalette();
  const { visibleState } = useFinance();
  const m = computeMonthMetrics(visibleState, month);

  return (
    <>
      <LedgerPicker />

      <DonutChart
        slices={m.categoryBreakdown.map((c) => ({ id: c.categoryId, value: c.amount, color: c.color }))}
        centerLabel="支出"
        centerValue={formatJPY(m.expense)}
      />

      <SectionTitle action="予算・計画" onAction={() => router.push('/planning')}>カテゴリ別</SectionTitle>
      {m.categoryBreakdown.length === 0 ? (
        <Group>
          <View style={{ padding: 28, alignItems: 'center' }}>
            <Text style={{ color: p.textSecondary }}>支出データがありません</Text>
          </View>
        </Group>
      ) : (
        <Group>
          {m.categoryBreakdown.map((c) => (
            <Pressable
              key={c.categoryId}
              onPress={() => router.push({ pathname: '/analytics/category', params: { id: c.categoryId } })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: pressed ? p.fill : 'transparent' })}>
              <IconBadge name={categoryIcon(c.categoryId)} color={c.color} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>{c.name}</Text>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: p.fill, marginTop: 6, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round(c.share * 100)}%`, height: 6, backgroundColor: c.color }} />
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: p.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatJPY(c.amount)}</Text>
                <Text style={{ color: p.textSecondary, fontSize: 12 }}>{Math.round(c.share * 100)}%</Text>
              </View>
            </Pressable>
          ))}
        </Group>
      )}
    </>
  );
}
