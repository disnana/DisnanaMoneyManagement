import { useRef, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { CURRENCY_META, getCategoryById } from '@dmm/core/data/categories';
import type { CurrencyCode, ForeignPurchasePrice } from '@dmm/core/types/finance';
import { formatJPY, formatMonthLabel, shiftMonth } from '@dmm/core/utils/format';
import { PRIORITY_LABELS } from '@dmm/core/utils/purchasePlan';
import { assessPurchaseForMonth, estimatePurchaseJPY, FOREIGN_PURCHASE_CURRENCIES } from '@dmm/core/utils/planning';
import { useCategoryPicker } from '@/lib/categoryPicker';
import { categoryIcon } from '@/lib/categoryIcons';
import { ALL_LEDGER_ICON, ledgerColor, ledgerIcon } from '@/lib/ledgerAppearance';
import { useLedgerPicker } from '@/lib/ledgerPicker';
import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { HeaderAction } from '@/ui/HeaderAction';
import { Group, Row, Screen, Segmented } from '@/ui/kit';
import { PlanningInput } from '@/ui/PlanningForm';
import { BudgetPie, PurchaseInsights } from '@/ui/PurchaseInsights';
import { Disclosure } from '@/ui/Disclosure';
import { PurchaseBankPicker, PurchaseCashPreview, usePurchaseBank } from '@/ui/PurchaseCashPreview';

const CURRENCIES = ['JPY', ...FOREIGN_PURCHASE_CURRENCIES] as const;
type EditorTab = 'purchase' | 'estimate';

export default function PurchaseEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, month, activeLedger, ledgers, savePurchaseCandidate } = useFinance();
  const p = usePalette();
  const pickLedger = useLedgerPicker();
  const pickCategory = useCategoryPicker();
  const existing = state.purchaseCandidates?.find((item) => item.id === id);
  const oldPrice = existing?.foreignPrice;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState(existing?.categoryId ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(oldPrice?.currency ?? 'JPY');
  const [amount, setAmount] = useState(existing ? String(oldPrice?.amount ?? existing.amount) : '');
  const [rate, setRate] = useState(oldPrice ? String(oldPrice.yenPerUnit) : '');
  const [fee, setFee] = useState(oldPrice?.feeJPY ? String(oldPrice.feeJPY) : '');
  const [priority, setPriority] = useState<1 | 2 | 3>(existing?.priority ?? 2);
  const [note, setNote] = useState(existing?.note ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [count, setCount] = useState(existing?.installment?.count ?? 1);
  const [ratePct, setRatePct] = useState(existing?.installment ? String(existing.installment.annualRatePct) : '0');
  const [tab, setTab] = useState<EditorTab>('purchase');
  const closing = useRef(false);
  const targetMonth = existing?.month ?? month;
  const [ledgerId, setLedgerId] = useState(() => existing ? existing.ledgerId : activeLedger?.id);
  const ledger = ledgers.find((item) => item.id === ledgerId);
  const payment = usePurchaseBank(ledgerId);
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
  const save = () => {
    if (!valid || !purchaseAmount || (id && !existing) || closing.current) return;
    closing.current = true;
    savePurchaseCandidate({ title: title.trim(), categoryId: category, amount: purchaseAmount, foreignPrice,
      month: targetMonth, ledgerId, priority, note: note.trim() || undefined, url: url.trim() || undefined,
      installment: count > 1 ? { count, annualRatePct: Number(ratePct) || 0 } : undefined }, existing?.id);
    router.back();
  };
  const showTab = (next: EditorTab) => {
    Keyboard.dismiss();
    setTab(next);
  };

  return (
    <>
      <Stack.Screen options={{
        title: id ? '購入候補を編集' : '購入候補を追加',
        headerRight: id && !existing ? undefined : () => (
          <HeaderAction name={{ ios: 'checkmark', android: 'check' }} label="保存" accent disabled={!valid} onPress={save} />
        ),
      }} />
      {id && !existing ? <Screen><Text style={{ color: p.textSecondary }}>購入候補が見つかりません</Text></Screen> : (
        <>
          <View style={{ backgroundColor: p.bg, paddingHorizontal: 16, paddingTop: 8 }}>
            <Segmented<EditorTab> value={tab} onChange={showTab}
              options={[{ id: 'purchase', label: '購入内容' }, { id: 'estimate', label: '資金の試算' }]} />
          </View>
          <Screen keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
            style={{ flex: 1, backgroundColor: p.bg, display: tab === 'purchase' ? 'flex' : 'none' }}
            contentContainerStyle={{ padding: 16, gap: 14 }}>
            <Text style={{ color: p.textSecondary, fontSize: 13 }}>{formatMonthLabel(targetMonth)}の買い物試算</Text>
            <Group>
              <PlanningInput label="買いたいもの" icon={{ ios: 'cart', android: 'shopping_cart' }} value={title} onChange={setTitle} />
              <Row title="家計グループ" right={ledger?.name ?? '選択なし'} chevron
                icon={ledger ? ledgerIcon(ledger) : ALL_LEDGER_ICON} iconColor={ledgerColor(ledger)} onPress={async () => {
                const choice = await pickLedger(ledgerId, '選択なし');
                if (choice !== null) setLedgerId(choice || undefined);
              }} />
              <Row title="カテゴリ" right={selectedCategory?.name ?? '選択'} chevron
                icon={selectedCategory ? categoryIcon(selectedCategory.icon ?? selectedCategory.id) : { ios: 'tag', android: 'label' }}
                iconColor={selectedCategory?.color}
                onPress={() => void pickCategory('expense', category, setCategory)} />
              <PlanningInput label={currency === 'JPY' ? '見込み価格' : `見込み価格（${currency}）`}
                icon={currency === 'JPY' ? { ios: 'yensign', android: 'currency_yen' } : { ios: 'banknote', android: 'payments' }}
                value={amount} onChange={setAmount} yen={currency === 'JPY'} decimal={currency !== 'JPY'} />
            </Group>
            <Group>
              <Row title="支払い通貨" right={currency === 'JPY' ? '日本円' : currency} chevron onPress={() => void chooseCurrency()} />
              {foreignPrice ? <PlanningInput label={`為替レート（1 ${currency} あたり円）`} icon={{ ios: 'arrow.left.arrow.right', android: 'currency_exchange' }} value={rate} onChange={setRate} decimal /> : null}
              {foreignPrice ? <PlanningInput label="手数料" optional icon={{ ios: 'yensign', android: 'currency_yen' }} value={fee} onChange={setFee} yen /> : null}
              {foreignPrice && purchaseAmount ? <Row title="円換算（手数料込み）" right={formatJPY(purchaseAmount)} /> : null}
            </Group>
            {category && purchaseAmount
              ? <BudgetPie month={targetMonth} ledgerId={ledgerId} extras={[{ categoryId: category, amount: purchaseAmount }]} />
              : <Text style={{ color: p.textSecondary, fontSize: 13 }}>カテゴリと価格を入れると、予算への影響を円グラフで確認できます。</Text>}
            <Group>
              <View style={{ padding: 8 }}>
                <Segmented<'1' | '2' | '3'> value={String(priority) as '1' | '2' | '3'} onChange={(v) => setPriority(Number(v) as 1 | 2 | 3)}
                  options={([1, 2, 3] as const).map((n) => ({ id: String(n) as '1' | '2' | '3', label: PRIORITY_LABELS[n] }))} />
              </View>
              <Row title="支払い方法" right={count > 1 ? `${count}回払い` : '一括'} chevron onPress={async () => {
                const choice = await pickOne('支払い方法', [1, 3, 6, 12, 24].map((n) => ({ id: String(n), label: n === 1 ? '一括' : `${n}回払い`, selected: n === count })));
                if (choice) setCount(Number(choice));
              }} />
              {count > 1 ? <PlanningInput label="年率（分割手数料）" icon={{ ios: 'percent', android: 'percent' }} unit="%" value={ratePct} onChange={setRatePct} decimal /> : null}
              <PlanningInput label="メモ" optional icon={{ ios: 'note.text', android: 'notes' }} value={note} onChange={setNote} />
              <PlanningInput label="商品のリンク" optional icon={{ ios: 'link', android: 'link' }} value={url} onChange={setUrl} />
            </Group>
            <Pressable accessibilityRole="button" onPress={() => showTab('estimate')} style={({ pressed }) => ({
              minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
              backgroundColor: p.tint, opacity: pressed ? 0.8 : 1,
            })}>
              <Text style={{ color: p.onTint, fontWeight: '700' }}>次へ</Text>
            </Pressable>
          </Screen>
          <Screen keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
            style={{ flex: 1, backgroundColor: p.bg, display: tab === 'estimate' ? 'flex' : 'none' }}
            contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}>
            {category && purchaseAmount ? <BudgetPie month={targetMonth} ledgerId={ledgerId} extras={[{ categoryId: category, amount: purchaseAmount }]} /> : null}
            <Group>
              <PurchaseBankPicker {...payment} />
              {purchaseAmount ? <Row title="購入予定額" right={formatJPY(purchaseAmount)} /> : null}
            </Group>
            <PurchaseInsights amount={purchaseAmount} month={targetMonth} ledgerId={ledgerId} categoryId={category || undefined}
              installment={count > 1 ? { count, annualRatePct: Number(ratePct) || 0 } : undefined} bank={payment.bank} />
            <Disclosure title="くわしく見る（残高の内訳・貯金・積立）">
              <PurchaseCashPreview key={ledgerId ?? 'none'} amount={purchaseAmount} month={targetMonth} ledgerId={ledgerId} bank={payment.bank} banks={payment.banks}
              budget={budget} nextBudget={nextBudget} categorySelected={Boolean(category)} />
            </Disclosure>
          </Screen>
        </>
      )}
    </>
  );
}
