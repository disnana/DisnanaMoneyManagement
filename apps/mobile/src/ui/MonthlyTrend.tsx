import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY, formatMonthLabel, shiftMonth } from '@dmm/core/utils/format';
import type { Transaction } from '@dmm/core/types/finance';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group } from '@/ui/kit';

export function MonthlyTrend({ month, kind }: { month: string; kind: 'income' | 'expense' }) {
  const p = usePalette();
  const { visibleState, setMonth } = useFinance();
  const values = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11));
    const transactionsByMonth = new Map<string, Transaction[]>(months.map((key) => [key, []]));
    for (const transaction of visibleState.transactions) {
      transactionsByMonth.get(transaction.date.slice(0, 7))?.push(transaction);
    }
    return months.map((key) => {
      const metrics = computeMonthMetrics({ ...visibleState, transactions: transactionsByMonth.get(key) ?? [] }, key);
      return { key, amount: metrics[kind] };
    });
  }, [month, kind, visibleState]);

  const label = kind === 'income' ? '収入' : '支出';
  const color = kind === 'income' ? p.income : p.danger;
  const chartHeight = 124;
  const max = Math.max(0, ...values.map(({ amount }) => amount));
  const min = Math.min(0, ...values.map(({ amount }) => amount));
  const scale = chartHeight / Math.max(1, max - min);
  const baseline = min < 0 ? max * scale : chartHeight;

  return (
    <>
      <Group>
        <View style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <Text style={{ color: p.textSecondary, fontSize: 13 }}>過去12か月の{label}</Text>
            <Text style={{ color: p.text, fontSize: 13 }}>{formatJPY(values.reduce((sum, item) => sum + item.amount, 0))}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {values.map(({ key, amount }) => {
              const selected = key === month;
              const height = amount === 0 ? 1 : Math.max(2, Math.round(Math.abs(amount) * scale));
              const top = amount < 0 ? baseline : Math.max(0, baseline - height);
              return (
                <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }}
                  accessibilityLabel={`${formatMonthLabel(key)}の${label} ${formatJPY(amount)}`} onPress={() => setMonth(key)}
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
      </Group>
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
