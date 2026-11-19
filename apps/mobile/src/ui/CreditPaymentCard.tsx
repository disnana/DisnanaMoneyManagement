import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getCycleRangeLabel, getPaymentWarning, type CreditCardStatementSummary } from '@dmm/core/utils/creditCard';
import { formatDayLabel, formatJPY, formatMonthLabel, getTodayString } from '@dmm/core/utils/format';
import { usePalette } from '@/lib/theme';
import { CardHeader, CardSurface } from './CardSurface';
import { IconBadge, MonthBar } from './kit';
import { PlanningProgress } from './PlanningSummary';

function warningLabel(days: number) {
  return days === 0 ? '今日が支払日' : `支払日まであと${days}日`;
}

export function CreditPaymentCard({ statement, onChangeMonth, onRecord }: {
  statement: CreditCardStatementSummary;
  onChangeMonth: (month: string) => void;
  onRecord: () => void;
}) {
  const p = usePalette();
  const { card, currentMonthKey, nextMonthKey, thisMonthRemaining, thisMonthConfirmed, thisMonthGross,
    thisMonthSettled, nextMonthRemaining, nextMonthConfirmed, thisMonthUsage, creditLimit, availableCredit, totalUnpaidBalance } = statement;
  const today = getTodayString();
  const warning = getPaymentWarning(statement, today, currentMonthKey);
  const nextWarning = getPaymentWarning(statement, today, nextMonthKey);
  const paid = thisMonthGross > 0 && thisMonthRemaining === 0;
  const month = Number(currentMonthKey.slice(5));

  return (
    <>
      <CardSurface>
        <CardHeader><MonthBar month={currentMonthKey} onChange={onChangeMonth} /></CardHeader>
        <View style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text accessibilityRole="header" style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>支払残額</Text>
            <Text style={{ backgroundColor: paid ? `${p.tint}16` : p.fill, color: paid ? p.tint : p.textSecondary,
              fontSize: 12, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' }}>
              {paid ? '支払い済み' : thisMonthConfirmed ? '確定' : '見込み'}
            </Text>
          </View>
          <View style={{ gap: 4 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit
              style={{ color: thisMonthRemaining > 0 ? p.danger : p.income, fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
              {formatJPY(thisMonthRemaining)}
            </Text>
            <Text style={{ color: p.textSecondary, fontSize: 13 }}>
              {formatDayLabel(card.paymentDay ?? 27)}払い · {getCycleRangeLabel(currentMonthKey, card.closingDay, card.paymentMonthOffset)}
            </Text>
            {warning !== null ? <Text style={{ color: p.danger, fontSize: 13, fontWeight: '700' }}>{warningLabel(warning)}</Text> : null}
          </View>
          {thisMonthSettled > 0 ? (
            <Text style={{ color: p.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>
              請求額 {formatJPY(thisMonthGross)} · 支払い記帳済み {formatJPY(thisMonthSettled)}
            </Text>
          ) : null}
          {thisMonthRemaining > 0 ? (
            <Pressable accessibilityRole="button" onPress={onRecord}
              style={({ pressed }) => ({
                minHeight: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 10,
                backgroundColor: p.tint, transform: [{ scale: pressed ? 0.98 : 1 }],
              })}>
              <Text style={{ color: p.onTint, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>支払いを記録</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, minHeight: 56,
          backgroundColor: p.fill, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.outline }}>
          <IconBadge name={{ ios: 'calendar', android: 'calendar_month' }} color={p.textSecondary} size={32} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: p.text, fontSize: 14, fontWeight: '700' }}>翌月の支払残額</Text>
            <Text style={{ color: p.textSecondary, fontSize: 12 }}>{formatMonthLabel(nextMonthKey)} · {nextMonthConfirmed ? '確定' : '見込み'}</Text>
            {nextWarning !== null ? <Text style={{ color: p.danger, fontSize: 12 }}>{warningLabel(nextWarning)}</Text> : null}
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: '36%', color: p.text, fontSize: 16,
            fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatJPY(nextMonthRemaining)}</Text>
        </View>
      </CardSurface>

      <CardSurface style={{ padding: 16, gap: 12 }}>
        <Text accessibilityRole="header" style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>カードの利用状況</Text>
        {creditLimit > 0 ? (
          <View style={{ gap: 7 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 }}>
              <Text style={{ color: p.textSecondary, fontSize: 13 }}>現在の利用可能額</Text>
              <Text style={{ color: p.income, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {formatJPY(availableCredit)}
              </Text>
            </View>
            <PlanningProgress amount={totalUnpaidBalance} total={creditLimit} color={p.tint} label="利用枠の使用率" />
            <Text style={{ color: p.textSecondary, fontSize: 12 }}>利用枠 {formatJPY(creditLimit)}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 14, paddingTop: creditLimit > 0 ? 10 : 0,
          borderTopWidth: creditLimit > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: p.outline }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: p.textSecondary, fontSize: 12 }}>現在の未払い残高</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: totalUnpaidBalance > 0 ? p.danger : p.income,
              fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatJPY(totalUnpaidBalance)}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: p.textSecondary, fontSize: 12 }}>{month}月のカード利用額</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.text,
              fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatJPY(thisMonthUsage)}</Text>
          </View>
        </View>
      </CardSurface>
    </>
  );
}
