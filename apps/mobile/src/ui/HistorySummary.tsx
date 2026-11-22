import { Text, useWindowDimensions, View } from 'react-native';
import { formatJPY } from '@dmm/core/utils/format';
import { computeMonthCashFlow } from '@dmm/core/utils/metrics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { AppSymbol } from './AppSymbol';
import { LedgerPicker } from './LedgerPicker';
import { MonthBar } from './kit';
import { historyMetrics as m, historyStyles as s } from './historyStyles';

export function HistorySummary({ month }: { month: string }) {
  const p = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const { visibleState, setMonth } = useFinance();
  const { income, expense, net } = computeMonthCashFlow(visibleState, month);
  const balance = (net > 0 ? '+' : '') + formatJPY(net);
  const longAmount = balance.length >= m.longAmountLength;
  const readableWidth = (Math.min(width, m.maxWidth) - 2 * m.gutter) / fontScale;
  // Group separators and currency signs also occupy space. Give long amounts their own line before scaling.
  const amountSize = Math.min(longAmount ? m.compactAmountSize : m.largeAmountSize, readableWidth / (balance.length * 0.65));
  const cashFlows = [
    { label: '収入', value: income, color: p.income, icon: { ios: 'arrow.up.right', android: 'north_east' } },
    { label: '支出', value: expense, color: p.danger, icon: { ios: 'arrow.down.right', android: 'south_east' } },
  ] as const;

  return (
    <View style={[s.hero, { backgroundColor: p.bg }]}>
      <MonthBar month={month} onChange={setMonth} heading />
      <View style={s.context}>
        <View style={s.balance}>
          <Text style={[s.label, { color: p.textSecondary }]}>月の収支</Text>
          <Text accessibilityLabel={`月の収支 ${formatJPY(net)}`} numberOfLines={1} adjustsFontSizeToFit
            style={[s.heroAmount, { color: p.text, fontSize: amountSize }]}>{balance}</Text>
        </View>
        <LedgerPicker inline />
      </View>
      <View style={[s.cashPair, (longAmount || readableWidth < m.stackedWidth) && s.stacked]}>
        {cashFlows.map(({ label, value, color, icon }) => (
          <View key={label} accessible accessibilityLabel={`${label} ${formatJPY(value)}`} style={s.cashItem}>
            <View style={s.cashLabel}>
              <AppSymbol name={icon} size={m.disclosure} tintColor={color} />
              <Text style={[s.supporting, { color: p.textSecondary }]}>{label}</Text>
            </View>
            <Text style={[s.cashAmount, { color: p.text }]}>{formatJPY(value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
