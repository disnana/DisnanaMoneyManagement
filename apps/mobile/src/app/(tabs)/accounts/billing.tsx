import { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { formatMonthLabel } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, Row, Screen } from '@/ui/kit';

export default function CardBilling() {
  const { id, month } = useLocalSearchParams<{ id: string; month: string }>();
  const { state, setConfirmedCardBilling } = useFinance();
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
              <TextInput accessibilityLabel="確定した請求額（円）" placeholder="確定した請求額（円）"
                placeholderTextColor={p.textSecondary} keyboardType="number-pad" value={amount}
                onChangeText={(value) => setAmount(value.normalize('NFKC').replace(/[^0-9]/g, '').slice(0, 12))}
                style={{ paddingHorizontal: 16, minHeight: 54, color: p.text, fontSize: 19 }} />
            </Group>
            <Text style={{ color: p.textSecondary }}>カード明細の請求総額を入力します。記帳済みの支払いは自動で差し引きます。支払い記録でポイントを入力する場合は、充当前の請求額を入力してください。</Text>
            <Pressable accessibilityRole="button" disabled={!amount} onPress={() => {
              setConfirmedCardBilling(id, month, Number(amount));
              router.back();
            }} style={{ minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: p.tint, opacity: amount ? 1 : 0.45 }}>
              <Text style={{ color: p.onTint, fontWeight: '700' }}>確定額を保存</Text>
            </Pressable>
            {entered !== undefined ? (
              <Group><Row title="利用履歴からの見込みに戻す" onPress={() => {
                setConfirmedCardBilling(id, month);
                router.back();
              }} /></Group>
            ) : null}
          </>
        ) : <Text style={{ color: p.textSecondary }}>対象の請求月が見つかりません</Text>}
      </Screen>
    </>
  );
}
