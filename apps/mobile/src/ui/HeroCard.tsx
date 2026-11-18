import { StyleSheet, Text, View } from 'react-native';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { metrics, usePalette } from '@/lib/theme';
import { LedgerPill } from '@/ui/LedgerPill';

export function HeroCard({ month, assets }: { month: string; assets: number }) {
  const p = usePalette();
  const { visibleState } = useFinance();
  const { income, expense, net } = computeMonthMetrics(visibleState, month);

  const stat = (label: string, value: number, color: string, showSign = false) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: p.textSecondary, fontSize: 12, fontWeight: '500' }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color, fontSize: 16, fontWeight: '700', marginTop: 3, fontVariant: ['tabular-nums'] }}>
        {showSign && value > 0 ? '+' : ''}{formatJPY(value)}
      </Text>
    </View>
  );

  return (
    <View style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius, borderCurve: 'continuous', padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text accessibilityRole="header" style={{ color: p.textSecondary, fontSize: 14, fontWeight: '600' }}>現在の総資産</Text>
        <LedgerPill />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit
        style={{ color: assets < 0 ? p.danger : p.income, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
        {formatJPY(assets)}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.separator, paddingTop: 10 }}>
        {stat('収入', income, income < 0 ? p.danger : p.income)}
        {stat('支出', expense, expense > 0 ? p.danger : p.income)}
        {stat('収支', net, net < 0 ? p.danger : p.income, true)}
      </View>
    </View>
  );
}
