import { StyleSheet, Text, View } from 'react-native';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { metrics, usePalette } from '@/lib/theme';
import { LedgerPill } from '@/ui/LedgerPill';
import { MonthBar } from '@/ui/kit';

export function HeroCard({ assets }: { assets: number }) {
  const p = usePalette();

  return (
    <View style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius, borderCurve: 'continuous',
      borderWidth: StyleSheet.hairlineWidth, borderColor: p.outline, overflow: 'hidden' }}>
      <View style={{ backgroundColor: `${p.tint}0A`, paddingHorizontal: 18, paddingVertical: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: p.text, flexShrink: 1, fontSize: 15, fontWeight: '700' }}>現在の総資産</Text>
          <LedgerPill />
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit
          style={{ color: assets < 0 ? p.danger : p.income, fontSize: 37, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {formatJPY(assets)}
        </Text>
      </View>
    </View>
  );
}

export function MonthlyCashFlow({ month }: { month: string }) {
  const p = usePalette();
  const { visibleState, setMonth } = useFinance();
  const { income, expense, net } = computeMonthMetrics(visibleState, month);
  const stats = [
    { label: '収入', amount: income, color: income < 0 ? p.danger : p.income },
    { label: '支出', amount: expense, color: expense > 0 ? p.danger : p.income },
    { label: '収支', amount: net, color: net < 0 ? p.danger : p.income },
  ];

  return (
    <View style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius, borderCurve: 'continuous',
      borderWidth: StyleSheet.hairlineWidth, borderColor: p.outline, overflow: 'hidden' }}>
      <View style={{ backgroundColor: p.sectionHeader, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.outline }}>
        <MonthBar month={month} onChange={setMonth} />
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 11 }}>
        {stats.map(({ label, amount, color }, index) => (
          <View key={label} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4, gap: 3,
            borderLeftColor: p.separator, borderLeftWidth: index > 0 ? StyleSheet.hairlineWidth : 0 }}>
            <Text style={{ color: p.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit
              style={{ color, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {label === '収支' && amount > 0 ? '+' : ''}{formatJPY(amount)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
