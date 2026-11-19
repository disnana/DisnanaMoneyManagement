import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getCycleRangeLabel, getPaymentWarning, type CreditCardStatementSummary } from '@dmm/core/utils/creditCard';
import { formatDayLabel, formatJPY, formatMonthLabel, getTodayString } from '@dmm/core/utils/format';
import { usePalette } from '@/lib/theme';
import { CardHeader, CardSurface } from './CardSurface';
import { MonthBar } from './kit';

export function CreditPaymentCard({ statement, onChangeMonth, onRecord, onEditBilling }: {
  statement: CreditCardStatementSummary;
  onChangeMonth: (month: string) => void;
  onRecord: () => void;
  onEditBilling: () => void;
}) {
  const p = usePalette();
  const { card, currentMonthKey, nextMonthKey, thisMonthRemaining, thisMonthConfirmed,
    thisMonthGross, thisMonthSettled, nextMonthRemaining, thisMonthUsage, creditLimit, availableCredit } = statement;
  const warning = getPaymentWarning(statement, getTodayString());
  const billingAction = thisMonthConfirmed ? '確定額を編集' : '確定額を入力';
  const month = Number(currentMonthKey.slice(5));

  return (
    <>
      <CardSurface>
        <CardHeader><MonthBar month={currentMonthKey} onChange={onChangeMonth} /></CardHeader>
        <View style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text accessibilityRole="header" style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>支払残額</Text>
            <View style={{ backgroundColor: p.fill, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ color: p.textSecondary, fontSize: 12, fontWeight: '700' }}>{thisMonthConfirmed ? '確定' : '見込み'}</Text>
            </View>
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit
            style={{ color: thisMonthRemaining > 0 ? p.danger : p.income, fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
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
              <Text style={{ color: p.onTint, fontSize: 14, fontWeight: '700' }}>支払いを記録</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: p.outline, backgroundColor: p.fill }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: p.textSecondary, fontSize: 12 }}>請求額</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit
                style={{ color: p.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatJPY(thisMonthGross)}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: p.textSecondary, fontSize: 12 }}>支払い記帳済み</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit
                style={{ color: p.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatJPY(thisMonthSettled)}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={onEditBilling}
            style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: p.tint, fontSize: 14, fontWeight: '700' }}>{billingAction}</Text>
          </Pressable>
        </View>
      </CardSurface>

      <CardSurface style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 14 }}>
        <View style={{ flexShrink: 1, gap: 3 }}>
          <Text style={{ color: p.textSecondary, fontSize: 12 }}>翌月の支払残額</Text>
          <Text style={{ color: p.text, fontSize: 14, fontWeight: '600' }}>{formatMonthLabel(nextMonthKey)}</Text>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1, color: p.text, fontSize: 21,
          fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatJPY(nextMonthRemaining)}</Text>
      </CardSurface>

      <CardSurface style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, gap: 5, padding: 14 }}>
          <Text style={{ color: p.textSecondary, fontSize: 12 }}>{month}月のカード利用額</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.text, fontSize: 18, fontWeight: '700',
            fontVariant: ['tabular-nums'] }}>{formatJPY(thisMonthUsage)}</Text>
        </View>
        {creditLimit > 0 ? (
          <View style={{ flex: 1, gap: 5, padding: 14, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: p.outline }}>
            <Text style={{ color: p.textSecondary, fontSize: 12 }}>現在の利用可能額</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.income, fontSize: 18, fontWeight: '700',
              fontVariant: ['tabular-nums'] }}>{formatJPY(availableCredit)}</Text>
          </View>
        ) : null}
      </CardSurface>
    </>
  );
}
