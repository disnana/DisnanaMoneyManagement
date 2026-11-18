import { useRef, useState } from 'react';
import { Text } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { CURRENCY_META, getCategoryById } from '@dmm/core/data/categories';
import type { CurrencyCode, ForeignPurchasePrice } from '@dmm/core/types/finance';
import { formatJPY, formatMonthLabel, shiftMonth } from '@dmm/core/utils/format';
import { assessPurchaseForMonth, estimatePurchaseJPY, FOREIGN_PURCHASE_CURRENCIES } from '@dmm/core/utils/planning';
import { pickCategory } from '@/lib/categoryPicker';
import { categoryIcon } from '@/lib/categoryIcons';
import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';
import { PlanningActions, PlanningInput } from '@/ui/PlanningForm';
import { PurchaseCashPreview } from '@/ui/PurchaseCashPreview';

const CURRENCIES = ['JPY', ...FOREIGN_PURCHASE_CURRENCIES] as const;

export default function PurchaseEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, month, activeLedger, savePurchaseCandidate } = useFinance();
  const p = usePalette();
  const existing = state.purchaseCandidates?.find((item) => item.id === id);
  const oldPrice = existing?.foreignPrice;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState(existing?.categoryId ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(oldPrice?.currency ?? 'JPY');
  const [amount, setAmount] = useState(existing ? String(oldPrice?.amount ?? existing.amount) : '');
  const [rate, setRate] = useState(oldPrice ? String(oldPrice.yenPerUnit) : '');
  const [fee, setFee] = useState(oldPrice?.feeJPY ? String(oldPrice.feeJPY) : '');
  const closing = useRef(false);
  const targetMonth = existing?.month ?? month;
  const ledgerId = existing ? existing.ledgerId : activeLedger?.id;
  const foreignPrice: ForeignPurchasePrice | undefined = currency !== 'JPY'
    ? { currency, amount: Number(amount), yenPerUnit: Number(rate), feeJPY: Number(fee) } : undefined;
  const price = foreignPrice ? estimatePurchaseJPY(foreignPrice) : Number(amount);
  const purchaseAmount = price && price > 0 ? price : undefined;
  const valid = Boolean(title.trim() && category && purchaseAmount);
  const selectedCategory = category ? getCategoryById(category, state.customCategories) : undefined;
  const budget = category ? assessPurchaseForMonth(state, targetMonth, category, purchaseAmount ?? 0, ledgerId) : undefined;
  const nextBudget = category && purchaseAmount
    ? assessPurchaseForMonth(state, shiftMonth(targetMonth, 1), category, purchaseAmount, ledgerId) : undefined;
  const chooseCurrency = async () => {
    const choice = await pickOne('支払い通貨', CURRENCIES.map((code) => ({
      id: code, label: CURRENCY_META[code].label, selected: code === currency,
    })));
    const selected = CURRENCIES.find((code) => code === choice);
    if (selected && selected !== currency) {
      setCurrency(selected);
      setAmount('');
      setRate('');
      setFee('');
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: id ? '購入候補を編集' : '購入候補を追加' }} />
      <Screen keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 16, gap: 14 }}>
        {id && !existing ? <Text style={{ color: p.textSecondary }}>購入候補が見つかりません</Text> : (
          <>
            <Text style={{ color: p.textSecondary, fontSize: 13 }}>{formatMonthLabel(targetMonth)}の買い物試算</Text>
            <Group>
              <PlanningInput label="買いたいもの" value={title} onChange={setTitle} />
              <Row title="カテゴリ" right={selectedCategory?.name ?? '選択'} chevron
                icon={selectedCategory ? categoryIcon(selectedCategory.icon ?? selectedCategory.id) : { ios: 'tag', android: 'label' }}
                iconColor={selectedCategory?.color}
                onPress={() => void pickCategory('expense', category, state, setCategory)} />
              <PlanningInput label={currency === 'JPY' ? '見込み価格（円）' : `見込み価格（${currency}）`}
                value={amount} onChange={setAmount} yen={currency === 'JPY'} decimal={currency !== 'JPY'} />
            </Group>
            <Group>
              <Row title="支払い通貨" right={currency === 'JPY' ? '日本円' : currency} chevron onPress={() => void chooseCurrency()} />
              {foreignPrice ? <PlanningInput label={`為替レート（1 ${currency} あたり円）`} value={rate} onChange={setRate} decimal /> : null}
              {foreignPrice ? <PlanningInput label="手数料（円・任意）" value={fee} onChange={setFee} yen /> : null}
              {foreignPrice && purchaseAmount ? <Row title="円換算（手数料込み）" right={formatJPY(purchaseAmount)} /> : null}
            </Group>
            <SectionTitle>資金の試算</SectionTitle>
            <PurchaseCashPreview amount={purchaseAmount} month={targetMonth} ledgerId={ledgerId}
              budget={budget} nextBudget={nextBudget} categorySelected={Boolean(category)} />
            <PlanningActions valid={valid} close={() => router.back()} save={() => {
              if (!purchaseAmount || closing.current) return;
              closing.current = true;
              savePurchaseCandidate({ title: title.trim(), categoryId: category, amount: purchaseAmount, foreignPrice,
                month: targetMonth, ledgerId }, existing?.id);
              router.back();
            }} />
          </>
        )}
      </Screen>
    </>
  );
}
