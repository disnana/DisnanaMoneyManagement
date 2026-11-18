import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import { formatForeignCurrency, formatJPY, formatMonthLabel, shiftMonth } from '@dmm/core/utils/format';
import { assessPurchaseForMonth } from '@dmm/core/utils/planning';
import { buildPurchaseTransaction, PRIORITY_LABELS } from '@dmm/core/utils/purchasePlan';
import { getTodayString } from '@dmm/core/utils/format';
import { pickOne } from '@/lib/pick';
import { success } from '@/lib/haptics';
import { BudgetPie, PurchaseInsights } from '@/ui/PurchaseInsights';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { HeaderAction } from '@/ui/HeaderAction';
import { PurchaseBankPicker, PurchaseCashPreview, usePurchaseBank } from '@/ui/PurchaseCashPreview';
import { AnchoredDeleteDialog } from '@/ui/AnchoredDeleteDialog';
import type { PopoverAnchor } from '@/ui/AnchoredPopover';
import { Group, Screen } from '@/ui/kit';

export default function PurchaseCompare() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, removePurchaseCandidate, addTransaction } = useFinance();
  const p = usePalette();
  const [deleteAnchor, setDeleteAnchor] = useState<PopoverAnchor>();
  const candidate = state.purchaseCandidates?.find((item) => item.id === id);
  const payment = usePurchaseBank(candidate?.ledgerId);
  const category = candidate ? getCategoryById(candidate.categoryId, state.customCategories) : undefined;
  const price = candidate?.foreignPrice;

  return (
    <>
      <Stack.Screen options={{ title: '買い物試算', headerRight: candidate ? () => (
        <View style={{ flexDirection: 'row' }}>
          <HeaderAction name={{ ios: 'trash', android: 'delete' }} label="削除"
            onPress={({ nativeEvent }) => setDeleteAnchor({ x: nativeEvent.pageX, y: nativeEvent.pageY })} />
          <HeaderAction name={{ ios: 'pencil', android: 'edit' }} label="編集"
            onPress={() => router.push({ pathname: '/purchase-editor', params: { id } })} />
        </View>
      ) : undefined }} />
      <Screen automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14 }}>
        {candidate ? (
          <>
            <View style={{ backgroundColor: p.card, borderRadius: 15, padding: 16, gap: 6 }}>
              <Text style={{ color: p.textSecondary, fontSize: 13 }}>{formatMonthLabel(candidate.month)} · {category?.name}</Text>
              <Text style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>{candidate.title}</Text>
              <Text style={{ color: p.text, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatJPY(candidate.amount)}</Text>
              {candidate.priority ? <Text style={{ color: p.textSecondary, fontSize: 13 }}>優先度: {PRIORITY_LABELS[candidate.priority]}</Text> : null}
              {candidate.note ? <Text style={{ color: p.text, fontSize: 14 }}>{candidate.note}</Text> : null}
              {candidate.url ? <Text accessibilityRole="link" onPress={() => void Linking.openURL(/^https?:\/\//i.test(candidate.url!) ? candidate.url! : `https://${candidate.url}`)}
                numberOfLines={1} style={{ color: p.tint, fontSize: 14 }}>{candidate.url}</Text> : null}
              {price ? <Text style={{ color: p.textSecondary, fontSize: 13 }}>
                {formatForeignCurrency(price.amount, price.currency)} · レート {price.yenPerUnit}円{price.feeJPY ? ` · 手数料 ${formatJPY(price.feeJPY)}` : ''}
              </Text> : null}
            </View>
            <BudgetPie month={candidate.month} ledgerId={candidate.ledgerId} extras={[{ categoryId: candidate.categoryId, amount: candidate.amount }]} />
            <Group><PurchaseBankPicker {...payment} /></Group>
            <PurchaseCashPreview amount={candidate.amount} month={candidate.month} ledgerId={candidate.ledgerId} bank={payment.bank} banks={payment.banks}
              budget={assessPurchaseForMonth(state, candidate.month, candidate.categoryId, candidate.amount, candidate.ledgerId)}
              nextBudget={assessPurchaseForMonth(state, shiftMonth(candidate.month, 1), candidate.categoryId, candidate.amount, candidate.ledgerId)} />
            <PurchaseInsights amount={candidate.amount} month={candidate.month} ledgerId={candidate.ledgerId} categoryId={candidate.categoryId}
              installment={candidate.installment} bank={payment.bank} />
            <Pressable accessibilityRole="button" onPress={async () => {
              const choice = await pickOne('支払った口座', state.accounts.map((a) => ({ id: a.id, label: a.name, selected: a.id === payment.bank?.id })));
              if (!choice) return;
              addTransaction(buildPurchaseTransaction(candidate, choice, getTodayString()));
              removePurchaseCandidate(candidate.id);
              success();
              router.back();
            }} style={({ pressed }) => ({ minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: p.tint, opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ color: p.onTint, fontSize: 16, fontWeight: '700' }}>購入した（取引に記録）</Text>
            </Pressable>
          </>
        ) : <Text style={{ color: p.textSecondary }}>購入候補が見つかりません</Text>}
      </Screen>
      <AnchoredDeleteDialog heading="購入候補を削除しますか？" title={deleteAnchor ? candidate?.title : undefined} anchor={deleteAnchor} onCancel={() => setDeleteAnchor(undefined)} onDelete={() => {
        if (!candidate) return;
        setDeleteAnchor(undefined);
        removePurchaseCandidate(candidate.id);
        router.back();
      }} />
    </>
  );
}
