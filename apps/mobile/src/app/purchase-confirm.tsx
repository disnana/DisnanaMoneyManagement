import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import { formatFullDate, formatJPY, getTodayString } from '@dmm/core/utils/format';
import { assessPurchaseForMonth } from '@dmm/core/utils/planning';
import { confirmPurchase } from '@dmm/core/utils/purchasePlan';
import { pickOne } from '@/lib/pick';
import { confirmAction } from '@/lib/confirmAction';
import { success } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { closeEditor, useFinanceSubmit } from '@/lib/useFinanceSubmit';
import { usePalette } from '@/lib/theme';
import { Group, Row, Screen } from '@/ui/kit';
import { PlanningInput } from '@/ui/PlanningForm';
import { BudgetPie } from '@/ui/PurchaseInsights';

const toDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Final adjustment and check before a candidate becomes a confirmed (planned) purchase. */
export default function PurchaseConfirm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, accountBalances, savePurchaseCandidate } = useFinance();
  const submit = useFinanceSubmit();
  const p = usePalette();
  const c = state.purchaseCandidates?.find((item) => item.id === id);
  const [price, setPrice] = useState(c ? String(c.amount) : '');
  const [date, setDate] = useState(c?.plannedDate ?? getTodayString());
  const [accountId, setAccountId] = useState(c?.accountId ?? state.accounts.find((a) => a.type === 'bank')?.id ?? state.accounts[0]?.id ?? '');
  const [count, setCount] = useState(c?.installment?.count ?? 1);
  if (!c) return <Screen><Text style={{ color: p.textSecondary }}>購入候補が見つかりません</Text></Screen>;

  const amount = Math.round(Number(price)) || 0;
  const account = state.accounts.find((a) => a.id === accountId);
  const balance = accountBalances[accountId] ?? 0;
  const budget = assessPurchaseForMonth(state, date.slice(0, 7), c.categoryId, amount, c.ledgerId);
  const budgetOk = !budget || budget.shortfall === 0;
  const cashOk = count > 1 || balance >= amount;
  const valid = amount > 0 && Boolean(account);
  const category = getCategoryById(c.categoryId, state.customCategories);

  const confirm = () => {
    const done = async () => {
      const saved = await submit(() => savePurchaseCandidate(confirmPurchase(c, {
        amount, plannedDate: date, accountId,
        installment: count > 1 ? { count, annualRatePct: c.installment?.annualRatePct ?? 0 } : undefined,
      }), c.id));
      if (!saved) return;
      success();
      closeEditor('/planning');
    };
    if (budgetOk && cashOk) return done();
    confirmAction('このまま確定しますか？', [!budgetOk ? '予算を超えます。' : '', !cashOk ? '口座の残高が足りません。' : ''].filter(Boolean).join(''),
      { text: '確定する', style: 'destructive', onPress: done }, '見直す');
  };

  const check = (ok: boolean, label: string, detail: string) => (
    <Row title={`${ok ? '✓' : '⚠'} ${label}`} subtitle={detail} rightColor={ok ? p.income : p.danger} />
  );

  return (
    <>
      <Stack.Screen options={{ title: '購入の最終確認' }} />
      <Screen automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ backgroundColor: p.card, borderRadius: 15, padding: 16, gap: 4 }}>
          <Text style={{ color: p.textSecondary, fontSize: 13 }}>{category.name}</Text>
          <Text style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>{c.title}</Text>
        </View>

        <Group>
          <PlanningInput label="最終価格" icon={{ ios: 'yensign', android: 'currency_yen' }} value={price} onChange={setPrice} yen />
          {Platform.OS === 'ios' ? (
            <View style={{ minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>購入予定日</Text>
              <DateTimePicker value={new Date(`${date}T00:00:00`)} mode="date" display="compact" locale="ja-JP" accentColor={p.tint}
                onChange={(_, d) => d && setDate(toDate(d))} />
            </View>
          ) : (
            <Row title="購入予定日" right={formatFullDate(date)} chevron={Platform.OS === 'android'}
              onPress={Platform.OS === 'android' ? () => DateTimePickerAndroid.open({ value: new Date(`${date}T00:00:00`), mode: 'date', onChange: (_, d) => d && setDate(toDate(d)) }) : undefined} />
          )}
          <Row title="支払う口座" right={account?.name ?? '選択'} chevron onPress={async () => {
            const choice = await pickOne('支払う口座', state.accounts.map((a) => ({ id: a.id, label: a.name, selected: a.id === accountId })));
            if (choice) setAccountId(choice);
          }} />
          <Row title="支払い方法" right={count > 1 ? `${count}回払い` : '一括'} chevron onPress={async () => {
            const choice = await pickOne('支払い方法', [1, 3, 6, 12, 24].map((n) => ({ id: String(n), label: n === 1 ? '一括' : `${n}回払い`, selected: n === count })));
            if (choice) setCount(Number(choice));
          }} />
        </Group>

        {amount > 0 ? <BudgetPie month={date.slice(0, 7)} ledgerId={c.ledgerId} extras={[{ categoryId: c.categoryId, amount }]} /> : null}

        <Group>
          {check(budgetOk, 'カテゴリの予算', budget ? (budgetOk ? `購入後の残り ${formatJPY(budget.remaining)}` : `${formatJPY(budget.shortfall)} 超過`) : '予算は未設定です')}
          {check(cashOk, '口座の残高', count > 1 ? `分割払いのため一括の残高は不要（現在 ${formatJPY(balance)}）` : cashOk ? `購入後 ${formatJPY(balance - amount)}` : `${formatJPY(amount - balance)} 不足（現在 ${formatJPY(balance)}）`)}
        </Group>

        <Pressable accessibilityRole="button" disabled={!valid} onPress={confirm}
          style={({ pressed }) => ({ minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: p.tint, opacity: !valid ? 0.45 : pressed ? 0.8 : 1 })}>
          <Text style={{ color: p.onTint, fontSize: 16, fontWeight: '700' }}>この内容で確定</Text>
        </Pressable>
      </Screen>
    </>
  );
}
