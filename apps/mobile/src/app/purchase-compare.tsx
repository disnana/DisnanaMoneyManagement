import { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import { formatForeignCurrency, formatJPY, formatMonthLabel, shiftMonth } from '@dmm/core/utils/format';
import { assessPurchaseForMonth } from '@dmm/core/utils/planning';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { HeaderAction } from '@/ui/HeaderAction';
import { PurchaseBankPicker, PurchaseCashPreview, usePurchaseBank } from '@/ui/PurchaseCashPreview';
import { AnchoredDeleteDialog } from '@/ui/AnchoredDeleteDialog';
import type { PopoverAnchor } from '@/ui/AnchoredPopover';
import { Group, Screen } from '@/ui/kit';

export default function PurchaseCompare() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, removePurchaseCandidate } = useFinance();
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
              {price ? <Text style={{ color: p.textSecondary, fontSize: 13 }}>
                {formatForeignCurrency(price.amount, price.currency)} · レート {price.yenPerUnit}円{price.feeJPY ? ` · 手数料 ${formatJPY(price.feeJPY)}` : ''}
              </Text> : null}
            </View>
            <Group><PurchaseBankPicker {...payment} /></Group>
            <PurchaseCashPreview amount={candidate.amount} month={candidate.month} ledgerId={candidate.ledgerId} bank={payment.bank} banks={payment.banks}
              budget={assessPurchaseForMonth(state, candidate.month, candidate.categoryId, candidate.amount, candidate.ledgerId)}
              nextBudget={assessPurchaseForMonth(state, shiftMonth(candidate.month, 1), candidate.categoryId, candidate.amount, candidate.ledgerId)} />
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
