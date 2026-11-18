import { Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import { formatForeignCurrency, formatJPY, formatMonthLabel, shiftMonth } from '@dmm/core/utils/format';
import { assessPurchaseForMonth } from '@dmm/core/utils/planning';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { pickOne } from '@/lib/pick';
import { HeaderAction } from '@/ui/HeaderAction';
import { PurchaseCashPreview } from '@/ui/PurchaseCashPreview';
import { Screen } from '@/ui/kit';

export default function PurchaseCompare() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, removePurchaseCandidate } = useFinance();
  const p = usePalette();
  const candidate = state.purchaseCandidates?.find((item) => item.id === id);
  const category = candidate ? getCategoryById(candidate.categoryId, state.customCategories) : undefined;
  const price = candidate?.foreignPrice;

  return (
    <>
      <Stack.Screen options={{ title: '買い物試算', headerRight: candidate ? () => (
        <View style={{ flexDirection: 'row' }}>
          <HeaderAction name={{ ios: 'trash', android: 'delete' }} label="削除" onPress={async () => {
            const choice = await pickOne(`「${candidate.title}」を削除しますか？`, [{ id: 'delete', label: '削除', destructive: true }]);
            if (choice === 'delete') { removePurchaseCandidate(id); router.back(); }
          }} />
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
            <PurchaseCashPreview amount={candidate.amount} month={candidate.month}
              budget={assessPurchaseForMonth(state, candidate.month, candidate.categoryId, candidate.amount, candidate.ledgerId)}
              nextBudget={assessPurchaseForMonth(state, shiftMonth(candidate.month, 1), candidate.categoryId, candidate.amount, candidate.ledgerId)} />
          </>
        ) : <Text style={{ color: p.textSecondary }}>購入候補が見つかりません</Text>}
      </Screen>
    </>
  );
}
