import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getCycleRangeLabel, getPaymentWarning, type CreditCardStatementSummary } from '@dmm/core/utils/creditCard';
import { formatDayLabel, formatJPY, formatMonthLabel, getTodayString } from '@dmm/core/utils/format';
import { usePalette } from '@/lib/theme';

export function CreditPaymentCard({ statement, onRecord }: {
  statement: CreditCardStatementSummary;
  onRecord: () => void;
}) {
  const p = usePalette();
  const { card, currentMonthKey, thisMonthRemaining, thisMonthConfirmed } = statement;
  const warning = getPaymentWarning(statement, getTodayString());

  return (
    <View style={{ padding: 16, gap: 10, backgroundColor: p.sectionHeader,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.outline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: p.text, flexShrink: 1, fontSize: 14, fontWeight: '700' }}>
          {formatMonthLabel(currentMonthKey)}の支払残額
        </Text>
        <Text style={{ color: p.textSecondary, fontSize: 12, fontWeight: '700' }}>
          {thisMonthConfirmed ? '確定' : '見込み'}
        </Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit
        style={{ color: thisMonthRemaining > 0 ? p.danger : p.income, fontSize: 31, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
        {formatJPY(thisMonthRemaining)}
      </Text>
      <Text style={{ color: p.textSecondary, fontSize: 12 }}>
        {getCycleRangeLabel(currentMonthKey, card.closingDay, card.paymentMonthOffset)} · {formatDayLabel(card.paymentDay ?? 27)}払い
      </Text>
      {warning !== null ? (
        <Text style={{ color: p.danger, fontWeight: '700', fontSize: 13 }}>
          {warning === 0 ? '今日が支払日です' : `支払日まであと${warning}日`}
        </Text>
      ) : null}
      {thisMonthRemaining > 0 ? (
        <Pressable accessibilityRole="button" onPress={onRecord}
          style={({ pressed }) => ({
            minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10,
            backgroundColor: p.tint, opacity: pressed ? 0.8 : 1,
          })}>
          <Text style={{ color: p.onTint, fontSize: 14, fontWeight: '700' }}>選択月分の支払いを記録</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
