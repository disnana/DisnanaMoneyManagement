import { Text, View } from 'react-native';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';

/** Total assets + this month's income / expense / balance (shared by Home and Accounts). */
export function HeroCard() {
  const { state, totalAssets, month } = useFinance();
  const m = computeMonthMetrics(state, month);

  const stat = (label: string, value: string, color?: string) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '500' }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: color ?? '#fff', fontSize: 16, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );

  return (
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
  );
}
