import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { formatMonthLabel } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { closeEditor, useFinanceSubmit } from '@/lib/useFinanceSubmit';
import { usePalette } from '@/lib/theme';
import { PlanningInput } from '@/ui/PlanningForm';
import { Group, Row, Screen } from '@/ui/kit';

export default function CardBilling() {
  const { id, month } = useLocalSearchParams<{ id: string; month: string }>();
  const { state, setConfirmedCardBilling } = useFinance();
  const submit = useFinanceSubmit();
  const p = usePalette();
  const card = state.accounts.find((account) => account.id === id && account.type === 'credit');
  const entered = card?.confirmedBillings?.[month];
  const [amount, setAmount] = useState(entered === undefined ? '' : String(entered));
  return (
    <>
      <Stack.Screen options={{ title: '確定した請求額' }} />
      <Screen automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        {card && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? (
          <>
            <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>{card.name} · {formatMonthLabel(month)}支払分</Text>
            <Group>
              <PlanningInput label="確定した請求額" icon={{ ios: 'yensign', android: 'currency_yen' }} value={amount} onChange={setAmount} yen />
            </Group>
            <Text style={{ color: p.textSecondary }}>カード明細の請求総額を入力します。記帳済みの支払いは自動で差し引きます。支払い記録でポイントを入力する場合は、充当前の請求額を入力してください。</Text>
            <Pressable accessibilityRole="button" disabled={!amount} onPress={async () => {
              if (await submit(() => setConfirmedCardBilling(id, month, Number(amount)))) closeEditor({ pathname: '/accounts/[id]', params: { id } });
            }} style={{ minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: p.tint, opacity: amount ? 1 : 0.45 }}>
              <Text style={{ color: p.onTint, fontWeight: '700' }}>確定額を保存</Text>
            </Pressable>
            {entered !== undefined ? (
              <Group><Row title="利用履歴からの見込みに戻す" onPress={async () => {
                if (await submit(() => setConfirmedCardBilling(id, month))) closeEditor({ pathname: '/accounts/[id]', params: { id } });
              }} /></Group>
            ) : null}
          </>
        ) : <Text style={{ color: p.textSecondary }}>対象の請求月が見つかりません</Text>}
      </Screen>
    </>
  );
}
