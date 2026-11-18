import { Text, View } from 'react-native';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { LedgerPill } from '@/ui/LedgerPill';

/** Total assets + this month's income / expense / balance (shared by Home and Accounts). */
export function HeroCard({ month, withLedger }: { month: string; withLedger?: boolean }) {
  const { visibleState, visibleAssets } = useFinance();
  const m = computeMonthMetrics(visibleState, month);

  const stat = (label: string, value: string, color?: string) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500' }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: color ?? '#fff', fontSize: 16, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );

  return (
    <View style={{ backgroundColor: '#0F766E', borderRadius: 22, borderCurve: 'continuous', padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
        <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '500' }}>総資産残高</Text>
        {withLedger ? <LedgerPill /> : null}
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: '#fff', fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
        {formatJPY(visibleAssets)}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.18)' }}>
        {stat('収入', formatJPY(m.income))}
        {stat('支出', formatJPY(m.expense))}
        {stat('収支', `${m.net >= 0 ? '+' : ''}${formatJPY(m.net)}`, m.net >= 0 ? '#A7F3D0' : '#FECACA')}
      </View>
    </View>
  );
}
