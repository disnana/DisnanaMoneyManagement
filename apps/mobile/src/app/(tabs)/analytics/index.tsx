import { Text, View } from 'react-native';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { categoryIcon } from '@/lib/categoryIcons';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { DonutChart } from '@/ui/PieChart';
import { Group, IconBadge, MonthBar, Screen, SectionTitle } from '@/ui/kit';

export default function Analytics() {
  const p = usePalette();
  const { state, month, setMonth } = useFinance();
  const m = computeMonthMetrics(state, month);

  return (
    <Screen>
      <MonthBar month={month} onChange={setMonth} />

      <DonutChart
        slices={m.categoryBreakdown.map((c) => ({ id: c.categoryId, value: c.amount, color: c.color }))}
        centerLabel="支出"
        centerValue={formatJPY(m.expense)}
      />

      <SectionTitle>カテゴリ別</SectionTitle>
      {m.categoryBreakdown.length === 0 ? (
        <Group>
          <View style={{ padding: 28, alignItems: 'center' }}>
            <Text style={{ color: p.textSecondary }}>支出データがありません</Text>
          </View>
        </Group>
      ) : (
        <Group>
          {m.categoryBreakdown.map((c) => (
            <View key={c.categoryId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
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
            </View>
          ))}
        </Group>
      )}
    </Screen>
  );
}
