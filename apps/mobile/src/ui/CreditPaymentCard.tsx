import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getCycleRangeLabel, getPaymentWarning, type CreditCardStatementSummary } from '@dmm/core/utils/creditCard';
import { formatDayLabel, formatJPY, formatMonthLabel, getTodayString } from '@dmm/core/utils/format';
import { usePalette } from '@/lib/theme';
import { useAppearanceStyle, type AppearanceStyle } from '@/lib/themePref';
import { CardHeader, CardSurface } from './CardSurface';
import { IconBadge, MonthBar } from './kit';
import { PlanningProgress } from './PlanningSummary';

function warningLabel(days: number) {
  return days === 0 ? '今日が支払日' : `支払日まであと${days}日`;
}

type PaymentCardProps = {
  statement: CreditCardStatementSummary;
  onChangeMonth: (month: string) => void;
  onRecord: () => void;
};

export function CreditPaymentCard(props: PaymentCardProps) {
  const [appearance] = useAppearanceStyle();
  return appearance === 'standard' ? <StandardCreditPaymentCard {...props} />
    : <StyledCreditPaymentCard {...props} appearance={appearance} />;
}

function RecordPayment({ onPress, radius = 10 }: { onPress: () => void; radius?: number }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: radius,
        backgroundColor: p.tint, transform: [{ scale: pressed ? 0.98 : 1 }],
      })}>
      <Text style={{ color: p.onTint, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>支払いを記録</Text>
    </Pressable>
  );
}

function StandardCreditPaymentCard({ statement, onChangeMonth, onRecord }: PaymentCardProps) {
  const p = usePalette();
  const { card, currentMonthKey, nextMonthKey, thisMonthRemaining, thisMonthConfirmed, thisMonthGross,
    thisMonthSettled, nextMonthRemaining, nextMonthConfirmed, thisMonthUsage, creditLimit, availableCredit, totalUnpaidBalance } = statement;
  const today = getTodayString();
  const warning = getPaymentWarning(statement, today, currentMonthKey);
  const nextWarning = getPaymentWarning(statement, today, nextMonthKey);
  const paid = thisMonthGross > 0 && thisMonthRemaining === 0;
  const month = Number(currentMonthKey.slice(5));
  const usagePercent = Math.round(statement.utilizationRatio * 100);

  return (
    <>
      <CardSurface style={{ borderColor: `${p.tint}75` }}>
        <CardHeader style={{ backgroundColor: `${p.tint}24`, borderBottomColor: `${p.tint}55` }}>
          <MonthBar month={currentMonthKey} onChange={onChangeMonth} />
        </CardHeader>
        <View style={{ padding: 16, gap: 12, backgroundColor: `${p.tint}0C` }}>
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
          {thisMonthRemaining > 0 ? <RecordPayment onPress={onRecord} /> : null}
        </View>
      </CardSurface>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingVertical: 2, minHeight: 44 }}>
        <IconBadge name={{ ios: 'calendar', android: 'calendar_month' }} color={p.textSecondary} size={34} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: p.text, fontSize: 14, fontWeight: '700' }}>翌月の支払残額</Text>
          <Text style={{ color: p.textSecondary, fontSize: 12 }}>{formatMonthLabel(nextMonthKey)} · {nextMonthConfirmed ? '確定' : '見込み'}</Text>
          {nextWarning !== null ? <Text style={{ color: p.danger, fontSize: 12 }}>{warningLabel(nextWarning)}</Text> : null}
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: '38%', color: p.text, fontSize: 17,
          fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatJPY(nextMonthRemaining)}</Text>
      </View>

      <CardSurface style={{ borderColor: creditLimit > 0 ? `${p.income}70` : p.outline }}>
        <View style={{ padding: 16, gap: 12, backgroundColor: creditLimit > 0 ? `${p.income}18` : p.card }}>
          <Text accessibilityRole="header" style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>カードの利用状況</Text>
          {creditLimit > 0 ? (
            <View style={{ gap: 7 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 }}>
                <Text style={{ color: p.textSecondary, fontSize: 13 }}>現在の利用可能額</Text>
                <Text style={{ color: p.income, fontSize: 21, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {formatJPY(availableCredit)}
                </Text>
              </View>
              <PlanningProgress amount={totalUnpaidBalance} total={creditLimit} color={p.income} label="利用枠の使用率" />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 }}>
                <Text style={{ color: p.textSecondary, fontSize: 12 }}>利用枠 {formatJPY(creditLimit)}</Text>
                <Text style={{ color: p.income, fontSize: 12, fontWeight: '700' }}>{usagePercent}% 使用</Text>
              </View>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 14, padding: 16, paddingTop: creditLimit > 0 ? 12 : 0,
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

function StatementLine({ label, amount, color, emphasis = false }: {
  label: string; amount: number; color?: string; emphasis?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap',
      columnGap: 12, rowGap: 4 }}>
      <Text accessibilityRole={emphasis ? 'header' : undefined}
        style={{ color: emphasis ? p.text : p.textSecondary, fontSize: 13, fontWeight: emphasis ? '700' : '400' }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit
        style={{ maxWidth: '100%', color: color ?? p.text, fontSize: emphasis ? 25 : 15, fontWeight: emphasis ? '800' : '700',
          fontVariant: ['tabular-nums'] }}>{formatJPY(amount)}</Text>
    </View>
  );
}

function StyledCreditPaymentCard({ appearance, statement, onChangeMonth, onRecord }: PaymentCardProps & {
  appearance: Exclude<AppearanceStyle, 'standard'>;
}) {
  const p = usePalette();
  const { card, currentMonthKey, nextMonthKey, thisMonthRemaining, thisMonthConfirmed, thisMonthGross,
    thisMonthSettled, nextMonthRemaining, nextMonthConfirmed, thisMonthUsage, creditLimit, availableCredit, totalUnpaidBalance } = statement;
  const today = getTodayString();
  const warning = getPaymentWarning(statement, today, currentMonthKey);
  const nextWarning = getPaymentWarning(statement, today, nextMonthKey);
  const paid = thisMonthGross > 0 && thisMonthRemaining === 0;
  const status = paid ? '支払い済み' : thisMonthConfirmed ? '確定' : '見込み';
  const dueDay = `${formatDayLabel(card.paymentDay ?? 27)}払い`;
  const cycle = getCycleRangeLabel(currentMonthKey, card.closingDay, card.paymentMonthOffset);
  const nextLabel = `${formatMonthLabel(nextMonthKey)} · ${nextMonthConfirmed ? '確定' : '見込み'}`;
  const monthUsageLabel = `${Number(currentMonthKey.slice(5))}月のカード利用額`;
  const hasLimit = creditLimit > 0;
  const paymentColor = thisMonthRemaining > 0 ? p.danger : p.income;
  const unpaidColor = totalUnpaidBalance > 0 ? p.danger : p.income;
  const separator = { borderTopColor: p.outline, borderTopWidth: StyleSheet.hairlineWidth };
  const monthBar = <MonthBar month={currentMonthKey} onChange={onChangeMonth} />;
  const statementWarning = warning !== null ? <Text style={{ color: p.danger, fontSize: 13, fontWeight: '700' }}>{warningLabel(warning)}</Text> : null;
  const nextMonthWarning = nextWarning !== null ? <Text style={{ color: p.danger, fontSize: 12 }}>{warningLabel(nextWarning)}</Text> : null;
  const recordedPayments = thisMonthSettled > 0 ? (
    <Text style={{ color: p.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>
      請求額 {formatJPY(thisMonthGross)} · 支払い記帳済み {formatJPY(thisMonthSettled)}
    </Text>
  ) : null;
  const capacity = hasLimit ? (
    <View style={{ gap: 8 }}>
      <StatementLine label="現在の利用可能額" amount={availableCredit} color={p.income} />
      <PlanningProgress amount={totalUnpaidBalance} total={creditLimit} color={p.income} label="利用枠の使用率" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <Text style={{ color: p.textSecondary, fontSize: 12 }}>利用枠 {formatJPY(creditLimit)}</Text>
        <Text style={{ color: p.income, fontSize: 12, fontWeight: '700' }}>{Math.round(statement.utilizationRatio * 100)}% 使用</Text>
      </View>
    </View>
  ) : null;

  if (appearance === 'classic') {
    return (
      <CardSurface>
        <CardHeader>{monthBar}</CardHeader>
        <View style={{ padding: 14, gap: 9 }}>
          <StatementLine label="支払残額" amount={thisMonthRemaining} color={paymentColor} emphasis />
          <Text style={{ color: p.textSecondary, fontSize: 13 }}>{status} · {dueDay} · {cycle}</Text>
          {statementWarning}
          {recordedPayments}
          {thisMonthRemaining > 0 ? <RecordPayment onPress={onRecord} radius={p.controlRadius} /> : null}
        </View>
        <View style={{ ...separator, paddingHorizontal: 14, paddingVertical: 11, gap: 4 }}>
          <StatementLine label="翌月の支払残額" amount={nextMonthRemaining} />
          <Text style={{ color: p.textSecondary, fontSize: 12 }}>{nextLabel}</Text>
          {nextMonthWarning}
        </View>
        <View style={{ ...separator, padding: 14, gap: 10 }}>
          <Text accessibilityRole="header" style={{ color: p.text, fontSize: 14, fontWeight: '700' }}>カードの利用状況</Text>
          {capacity}
          <StatementLine label="現在の未払い残高" amount={totalUnpaidBalance} color={unpaidColor} />
          <StatementLine label={monthUsageLabel} amount={thisMonthUsage} />
        </View>
      </CardSurface>
    );
  }

  if (appearance === 'modern') {
    const rule = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.outline };
    const figure = { fontWeight: '800' as const, fontVariant: ['tabular-nums'] as ['tabular-nums'] };
    return (
      <View style={{ paddingHorizontal: 4, gap: 16 }}>
        <View style={{ gap: 5 }}>
          {monthBar}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text accessibilityRole="header" style={{ color: p.textSecondary, fontSize: 14, fontWeight: '600', flexShrink: 1 }}>支払残額</Text>
            <Text style={{ color: paid ? p.tint : p.textSecondary, backgroundColor: p.fill,
              paddingVertical: 4, paddingHorizontal: 9, borderRadius: 10, overflow: 'hidden',
              fontSize: 12, fontWeight: '700' }}>{status}</Text>
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[figure, { color: paymentColor, fontSize: 48, letterSpacing: -1.8 }]}>
            {formatJPY(thisMonthRemaining)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10, rowGap: 2 }}>
            <Text style={{ color: p.text, fontWeight: '700', fontSize: 14 }}>{dueDay}</Text>
            <Text style={{ color: p.textSecondary, fontSize: 13 }}>{cycle}</Text>
          </View>
          {statementWarning}
          {recordedPayments}
          {thisMonthRemaining > 0 ? (
            <View style={{ alignSelf: 'flex-start', marginTop: 9 }}>
              <RecordPayment onPress={onRecord} radius={24} />
            </View>
          ) : null}
        </View>

        <View style={{ ...rule, paddingTop: 13, gap: 4 }}>
          <StatementLine label="翌月の支払残額" amount={nextMonthRemaining} />
          <Text style={{ color: p.textSecondary, fontSize: 12 }}>{nextLabel}</Text>
          {nextMonthWarning}
        </View>

        <View style={{ ...rule, paddingTop: 13, gap: 10 }}>
          <Text accessibilityRole="header" style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>カードの利用状況</Text>
          {capacity}
          <StatementLine label="現在の未払い残高" amount={totalUnpaidBalance} color={unpaidColor} />
          <StatementLine label={monthUsageLabel} amount={thisMonthUsage} />
        </View>
      </View>
    );
  }

  return (
    <>
      {monthBar}
      <CardSurface>
        <View style={{ padding: 18, gap: 14 }}>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <Text accessibilityRole="header" style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>支払残額</Text>
              <Text style={{ color: p.textSecondary, fontSize: 12, fontWeight: '600', backgroundColor: p.fill,
                paddingHorizontal: 9, paddingVertical: 4, borderRadius: p.controlRadius, overflow: 'hidden' }}>{status}</Text>
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: paymentColor, fontSize: 34,
              fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatJPY(thisMonthRemaining)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10,
            backgroundColor: p.fill, borderRadius: p.controlRadius }}>
            <IconBadge name={{ ios: 'calendar', android: 'calendar_month' }} color={p.tint} size={32} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: p.text, fontSize: 14, fontWeight: '700' }}>{dueDay}</Text>
              <Text style={{ color: p.textSecondary, fontSize: 12 }}>{cycle}</Text>
              {statementWarning}
            </View>
          </View>
          {recordedPayments}
          {thisMonthRemaining > 0 ? <RecordPayment onPress={onRecord} radius={p.controlRadius} /> : null}
        </View>
      </CardSurface>

      <View style={{ gap: 5, paddingHorizontal: 10 }}>
        <StatementLine label="翌月の支払残額" amount={nextMonthRemaining} />
        <Text style={{ color: p.textSecondary, fontSize: 12 }}>{nextLabel}</Text>
        {nextMonthWarning}
      </View>

      <CardSurface style={{ padding: 18, gap: 12 }}>
        <Text accessibilityRole="header" style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>カードの利用状況</Text>
        {capacity}
        <View style={{ gap: 10, ...(hasLimit ? { ...separator, paddingTop: 10 } : {}) }}>
          <StatementLine label="現在の未払い残高" amount={totalUnpaidBalance} color={unpaidColor} />
          <StatementLine label={monthUsageLabel} amount={thisMonthUsage} />
        </View>
      </CardSurface>
    </>
  );
}
