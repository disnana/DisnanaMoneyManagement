import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { formatJPY } from '@dmm/core/utils/format';
import { computeMonthCashFlow } from '@dmm/core/utils/metrics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { AppSymbol } from './AppSymbol';
import { LedgerPicker } from './LedgerPicker';
import { MonthBar } from './kit';
import { historyMetrics as m, historyStyles as s } from './historyStyles';

type Props = { month: string; expanded: boolean; onToggle: () => void };

export function HistorySummary({ month, expanded, onToggle }: Props) {
  const p = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const { visibleState, setMonth } = useFinance();
  const { income, expense, net } = computeMonthCashFlow(visibleState, month);
  const balance = (net > 0 ? '+' : '') + formatJPY(net);
  const available = (Math.min(width, m.maxWidth) - 2 * m.gutter) / fontScale;
  const compact = available < m.compactControlsWidth;
  const longBalance = balance.length >= m.longAmountLength;
  const flows = [
    { label: '収入', amount: formatJPY(income), color: p.income, icon: { ios: 'arrow.up.right', android: 'north_east' } },
    { label: '支出', amount: formatJPY(expense), color: p.danger, icon: { ios: 'arrow.down.right', android: 'south_east' } },
  ] as const;
  const separateLines = compact || flows.some(({ amount }) => amount.length >= m.longAmountLength);
  const arrow = <AppSymbol name={expanded ? { ios: 'chevron.up', android: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more' }}
    size={m.disclosure} tintColor={p.textSecondary} />;
  const disclosure = (
    <View style={s.disclosure}>
      <Text style={[s.label, { color: p.textSecondary }]}>内訳</Text>
      {arrow}
    </View>
  );
  const amount = (
    <Text numberOfLines={1} adjustsFontSizeToFit style={[s.balanceAmount, { color: p.text }]}>{balance}</Text>
  );

  const toggle = (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} aria-expanded={expanded}
      accessibilityLabel={`月の収支 ${formatJPY(net)}、内訳を${expanded ? '閉じる' : '表示'}`}
      onPress={onToggle} style={({ pressed }) => [s.balanceButton, pressed && { backgroundColor: p.fill }]}>
      {compact ? (
        <View style={s.disclosure}>
          <Text style={[s.scopeText, { color: p.text }]}>月計</Text>{arrow}
        </View>
      ) : (
        <>
          <View style={s.balanceLine}>
            <View style={s.balanceLead}>
              <Text style={[s.label, { color: p.textSecondary }]}>月の収支</Text>
              {longBalance ? null : amount}
            </View>
            {disclosure}
          </View>
          {longBalance ? amount : null}
        </>
      )}
    </Pressable>
  );

  return (
    <View style={[s.summary, { backgroundColor: p.bg, borderBottomColor: p.sectionHeader }]}>
      <MonthBar month={month} onChange={setMonth} heading compactHeading={compact} trailing={compact ? undefined : <LedgerPicker inline />} />
      {compact ? <View style={s.compactControls}>{toggle}<LedgerPicker inline /></View> : toggle}
      {expanded ? (
        <View style={[separateLines ? s.totalsStacked : s.totals, { borderTopColor: p.sectionHeader }]}>
          {compact ? (
            <View style={s.metricLine}><Text style={[s.label, { color: p.textSecondary }]}>月の収支</Text>{amount}</View>
          ) : null}
          {flows.map(({ label, amount: value, icon, color }) => (
            <View key={label} accessible accessibilityLabel={`${label} ${value}`} style={separateLines ? s.metricLine : s.metric}>
              <View style={s.metricLabel}>
                <AppSymbol name={icon} size={m.disclosure} tintColor={color} />
                <Text style={[s.label, { color: p.textSecondary }]}>{label}</Text>
              </View>
              <Text style={[s.metricAmount, { color: p.text }]}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
