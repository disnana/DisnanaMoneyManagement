import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { getPaymentWarning, type CreditCardStatementSummary } from '@dmm/core/utils/creditCard';
import { formatDayLabel, formatJPY, getTodayString } from '@dmm/core/utils/format';
import { tick } from '@/lib/haptics';
import { usePalette } from '@/lib/theme';
import { IconBadge } from './kit';

export function CreditPaymentCard({ statement, onPress }: {
  statement: CreditCardStatementSummary;
  onPress: () => void;
}) {
  const p = usePalette();
  const { card, currentMonthKey, nextMonthKey, thisMonthRemaining, thisMonthUsage, nextMonthRemaining, availableCredit, creditLimit } = statement;
  const month = Number(currentMonthKey.slice(5));
  const nextMonth = Number(nextMonthKey.slice(5));
  const warning = getPaymentWarning(statement, getTodayString());
  const stats = [
    { label: `${month}月の利用`, value: formatJPY(thisMonthUsage) },
    { label: `${nextMonth}月の支払い`, value: formatJPY(nextMonthRemaining) },
    { label: '残り枠', value: creditLimit > 0 ? formatJPY(availableCredit) : '未設定' },
  ];

  return (
    <Pressable accessibilityRole="button" accessibilityHint="カードの支払い明細を開く"
      onPress={() => { tick(); onPress(); }}
      style={({ pressed }) => ({
        padding: 13, gap: 10, borderRadius: 17, backgroundColor: pressed ? p.fill : p.card,
      })}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <IconBadge name={{ ios: 'creditcard.fill', android: 'credit_card' }} color={p.tint} size={32} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{card.name}</Text>
          {card.institution ? <Text style={{ color: p.textSecondary, fontSize: 12 }}>{card.institution}</Text> : null}
        </View>
        <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={15} tintColor={p.textSecondary} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: p.fill }}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ color: p.textSecondary, fontSize: 12 }}>{month}月の支払残額</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit
            style={{ color: p.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {formatJPY(thisMonthRemaining)}
          </Text>
        </View>
        <Text style={{ color: p.text, fontSize: 12, fontWeight: '600', paddingBottom: 4 }}>{formatDayLabel(card.paymentDay ?? 27)}払い</Text>
      </View>
      {warning !== null ? (
        <Text style={{ color: p.danger, fontWeight: '700', fontSize: 13 }}>
          {warning === 0 ? '今日が支払日です' : `支払日まであと${warning}日`}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stats.map(({ label, value }) => (
          <View key={label} style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: p.textSecondary, fontSize: 12 }}>{label}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit
              style={{ color: p.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}
