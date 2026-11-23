import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { computeMonthCashFlow } from '@dmm/core/utils/metrics';
import { formatJPY, formatMonthLabel, shiftMonth } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { AnalyticsMonthCard } from '@/ui/AnalyticsMonthCard';
import { Group } from '@/ui/kit';

export function MonthlyTrend({ month, kind }: { month: string; kind: 'income' | 'expense' }) {
  const p = usePalette();
  const { visibleState } = useFinance();
  const [selectedMonth, setSelectedMonth] = useState(month);
  const values = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11));
    return months.map((key) => {
      const metrics = computeMonthCashFlow(visibleState, key);
      return { key, amount: metrics[kind] };
    });
  }, [month, kind, visibleState]);

  const selectedAmount = values.find(({ key }) => key === selectedMonth)?.amount ?? 0;
  const label = kind === 'income' ? '収入' : '支出';
  const color = kind === 'income' ? p.income : p.danger;
  const chartHeight = 124;
  const max = Math.max(0, ...values.map(({ amount }) => amount));
  const min = Math.min(0, ...values.map(({ amount }) => amount));
  const scale = chartHeight / Math.max(1, max - min);
  const baseline = min < 0 ? max * scale : chartHeight;

  return (
    <>
      <AnalyticsMonthCard month={month}>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <Text style={{ color: p.textSecondary, fontSize: 13 }}>過去12か月の{label}</Text>
            <Text style={{ color: p.text, fontSize: 13 }}>{formatJPY(values.reduce((sum, item) => sum + item.amount, 0))}</Text>
          </View>
          <Text accessibilityLiveRegion="polite"
            style={{ color: p.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {formatMonthLabel(selectedMonth)}の{label}　{formatJPY(selectedAmount)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {values.map(({ key, amount }) => {
              const selected = key === selectedMonth;
              const height = amount === 0 ? 1 : Math.max(2, Math.round(Math.abs(amount) * scale));
              const top = amount < 0 ? baseline : Math.max(0, baseline - height);
              return (
                <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }}
                  accessibilityLabel={`${formatMonthLabel(key)}の${label} ${formatJPY(amount)}`} onPress={() => setSelectedMonth(key)}
                  style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                  <View style={{ width: '100%', height: chartHeight }}>
                    <View style={{ position: 'absolute', top: Math.min(baseline, chartHeight - 1), width: '100%',
                      height: 1, backgroundColor: p.separator }} />
                    <View style={{ position: 'absolute', left: '16%', top, width: '68%', height,
                      borderRadius: 2, backgroundColor: color, opacity: selected ? 1 : 0.45 }} />
                  </View>
                  <Text style={{ color: selected ? p.text : p.textSecondary, fontSize: 10, fontWeight: selected ? '700' : '400' }}>
                    {Number(key.slice(5))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </AnalyticsMonthCard>
      <Group>
        {values.slice().reverse().map(({ key, amount }) => (
          <View key={key} style={{ paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: p.text }}>{formatMonthLabel(key)}</Text>
            <Text style={{ color: amount === 0 ? p.textSecondary : color, fontVariant: ['tabular-nums'] }}>{formatJPY(amount)}</Text>
          </View>
        ))}
      </Group>
    </>
  );
}
