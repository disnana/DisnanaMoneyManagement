import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { CURRENCY_META, EXPENSE_CATEGORIES, getCategoryById } from '@dmm/core/data/categories';
import type { Budget, CurrencyCode, ForeignPurchasePrice, PurchaseCandidate, SavingsGoal } from '@dmm/core/types/finance';
import { formatForeignCurrency, formatFullDate, formatJPY, getTodayString, shiftMonth } from '@dmm/core/utils/format';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { assessPurchase, estimatePurchaseJPY, FOREIGN_PURCHASE_CURRENCIES, isPlanningDate, planSavings } from '@dmm/core/utils/planning';
import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, MonthBar, Row, Screen, SectionTitle, Segmented } from '@/ui/kit';
import { LedgerPicker } from '@/ui/LedgerPicker';

type Section = 'budget' | 'savings' | 'purchase';
type PlanningData = Pick<ReturnType<typeof useFinance>, 'visibleState' | 'month'>;
const categories = EXPENSE_CATEGORIES.map(({ id, name }) => ({ id, label: name }));
const PURCHASE_CURRENCIES = ['JPY', ...FOREIGN_PURCHASE_CURRENCIES] as const;

function Input({ label, value, onChange, yen, decimal }: {
  label: string; value: string; onChange: (text: string) => void; yen?: boolean; decimal?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
      <Text style={{ color: p.textSecondary, fontSize: 12 }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} keyboardType={yen ? 'number-pad' : decimal ? 'decimal-pad' : 'default'}
        onChangeText={(text) => onChange(yen || decimal
          ? text.normalize('NFKC').replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '').slice(0, decimal ? 18 : 12)
          : text)}
        style={{ minHeight: 36, color: p.text, fontSize: 17, paddingVertical: 2 }} />
    </View>
  );
}

function Actions({ save, close, label = '保存', valid = true }: {
  save: () => void; close: () => void; label?: string; valid?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable accessibilityRole="button" onPress={close}
        style={{ flex: 1, padding: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: p.card }}>
        <Text style={{ color: p.text, fontWeight: '600' }}>キャンセル</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !valid }} disabled={!valid} onPress={save}
        style={({ pressed }) => ({ flex: 1, padding: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center',
          backgroundColor: p.tint, borderRadius: 13, opacity: valid ? pressed ? 0.8 : 1 : 0.45 })}>
        <Text style={{ color: p.onTint, fontWeight: '700' }}>{label}</Text>
      </Pressable>
    </View>
  );
}

async function chooseCategory(categoryId: string, onChange: (id: string) => void) {
  const choice = await pickOne('カテゴリ', categories.map((option) => ({ ...option, selected: option.id === categoryId })));
  if (choice) onChange(choice);
}

async function confirmRemoval(title: string, onRemove: () => void) {
  const choice = await pickOne(title, [{ id: 'remove', label: '削除', destructive: true }]);
  if (choice === 'remove') onRemove();
}

function useMonthlySpending({ visibleState, month }: PlanningData, next = false) {
  const key = next ? shiftMonth(month, 1) : month;
  return useMemo(() => new Map(computeMonthMetrics(visibleState, key).categoryBreakdown.map(({ categoryId, amount }) => [
    categoryId, amount,
  ])), [visibleState, key]);
}

function Budgets() {
  const { state, activeLedger, visibleState, month, upsertBudget, removeBudget } = useFinance();
  const p = usePalette();
  const ledgerId = activeLedger?.id;
  const budgets = state.budgets.filter((item) => item.ledgerId === ledgerId);
  const spending = useMonthlySpending({ visibleState, month });
  const [editing, setEditing] = useState<'new' | Budget>();
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const edit = (budget?: 'new' | Budget) => {
    setEditing(budget);
    setCategory(budget && budget !== 'new' ? budget.categoryId : '');
    setAmount(budget && budget !== 'new' ? String(budget.monthlyLimit) : '');
  };
  const selected = getCategoryById(category);
  const spent = budgets.reduce((sum, item) => sum + (spending.get(item.categoryId) ?? 0), 0);
  const limit = budgets.reduce((sum, item) => sum + item.monthlyLimit, 0);
  const valid = Boolean(category) && Number(amount) > 0;

  return (
    <>
      <SectionTitle action="追加" onAction={() => edit('new')}>月間予算</SectionTitle>
      {editing ? (
        <>
          <Group>
            <Row title="カテゴリ" right={category ? selected.name : '選択'} chevron={editing === 'new'}
              onPress={editing === 'new' ? () => void chooseCategory(category, (id) => {
                const budget = budgets.find((item) => item.categoryId === id);
                setCategory(id);
                setAmount(budget ? String(budget.monthlyLimit) : '');
              }) : undefined} />
            <Input label="毎月の上限（円）" value={amount} onChange={setAmount} yen />
          </Group>
          <Actions valid={valid} close={() => edit()} save={() => {
            upsertBudget({ categoryId: category, monthlyLimit: Number(amount), ledgerId });
            edit();
          }} />
        </>
      ) : null}
      <Group>
        <Row title="予算を設定したカテゴリの残額" right={formatJPY(limit - spent)} rightColor={spent > limit ? p.danger : p.tint}
          subtitle={`${formatJPY(spent)} 使用 / ${formatJPY(limit)}`} />
        {budgets.map((budget) => {
          const used = spending.get(budget.categoryId) ?? 0;
          const remaining = budget.monthlyLimit - used;
          return (
            <Row key={budget.categoryId} title={getCategoryById(budget.categoryId).name}
              subtitle={`${formatJPY(used)} 使用 / ${formatJPY(budget.monthlyLimit)}`}
              right={remaining < 0 ? `${formatJPY(-remaining)}超過` : `残り ${formatJPY(remaining)}`}
              rightColor={remaining < 0 ? p.danger : undefined} chevron onPress={() => edit(budget)}
              onLongPress={() => void confirmRemoval('カテゴリ予算を削除しますか？', () => {
                removeBudget(budget.categoryId, ledgerId);
                if (category === budget.categoryId) edit();
              })} />
          );
        })}
      </Group>
      {budgets.length === 0 ? <Text style={{ color: p.textSecondary }}>カテゴリごとに毎月の上限を設定できます。</Text> : null}
    </>
  );
}

function Savings() {
  const { state, activeLedger, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal, contributeToGoal } = useFinance();
  const p = usePalette();
  const ledgerId = activeLedger?.id;
  const goals = state.savingsGoals.filter((goal) => !ledgerId || goal.ledgerId === ledgerId);
  const [editor, setEditor] = useState<'new' | SavingsGoal>();
  const [deposit, setDeposit] = useState<SavingsGoal>();
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [monthly, setMonthly] = useState('');
  const [amount, setAmount] = useState('');
  const edit = (goal: 'new' | SavingsGoal) => {
    setEditor(goal);
    setDeposit(undefined);
    setTitle(goal === 'new' ? '' : goal.title);
    setTarget(goal === 'new' ? '' : String(goal.targetAmount));
    setDate(goal === 'new' ? '' : goal.targetDate ?? '');
    setMonthly(goal === 'new' || !goal.monthlyContribution ? '' : String(goal.monthlyContribution));
  };
  const validDate = !date || isPlanningDate(date);

  return (
    <>
      <SectionTitle action="追加" onAction={() => edit('new')}>貯金目標</SectionTitle>
      {editor ? (
        <>
          <Group>
            <Input label="目標名" value={title} onChange={setTitle} />
            <Input label="目標額（円）" value={target} onChange={setTarget} yen />
            <Input label="目標日（任意・YYYY-MM-DD）" value={date} onChange={setDate} />
            <Input label="毎月の積立予定（円・任意）" value={monthly} onChange={setMonthly} yen />
          </Group>
          {!validDate ? <Text style={{ color: p.danger }}>目標日は YYYY-MM-DD 形式で入力してください。</Text> : null}
          <Actions close={() => setEditor(undefined)} valid={Boolean(title.trim()) && Number(target) > 0 && validDate} save={() => {
            const details = { title: title.trim(), targetAmount: Number(target), targetDate: date || undefined,
              monthlyContribution: Number(monthly) || undefined };
            if (editor === 'new') addSavingsGoal({ ...details, currentAmount: 0, ledgerId });
            else updateSavingsGoal(editor.id, details);
            setEditor(undefined);
          }} />
        </>
      ) : null}
      {deposit ? (
        <>
          <Group><Input label={`${deposit.title}への積立額（円）`} value={amount} onChange={setAmount} yen /></Group>
          <Actions label="積立を記録" close={() => setDeposit(undefined)} valid={Number(amount) > 0} save={() => {
            contributeToGoal(deposit.id, Number(amount));
            setDeposit(undefined);
          }} />
        </>
      ) : null}
      {goals.map((goal) => {
        const plan = planSavings(goal, getTodayString());
        return (
          <Group key={goal.id}>
            <Row title={goal.title} subtitle={goal.targetDate ? `目標日 ${formatFullDate(goal.targetDate)}` : undefined}
              right={`${formatJPY(goal.currentAmount)} / ${formatJPY(goal.targetAmount)}`} chevron
              onPress={() => edit(goal)} onLongPress={() => void confirmRemoval('貯金目標を削除しますか？', () => {
                deleteSavingsGoal(goal.id);
                if (editor && editor !== 'new' && editor.id === goal.id) setEditor(undefined);
                if (deposit?.id === goal.id) setDeposit(undefined);
              })} />
            <View style={{ padding: 16, gap: 8 }}>
              <View style={{ borderRadius: 5, height: 6, backgroundColor: p.fill, overflow: 'hidden' }}>
                <View style={{ backgroundColor: p.tint, height: 6,
                  width: `${Math.max(0, Math.min(100, goal.currentAmount / goal.targetAmount * 100))}%` }} />
              </View>
              <Text style={{ color: p.text }}>
                {plan.remaining ? `残り ${formatJPY(plan.remaining)}` : '目標達成'}
                {plan.overdue ? ' · 目標日を経過' : ''}
              </Text>
              {plan.monthlyRequired !== undefined && plan.remaining > 0 ? (
                <Text style={{ color: plan.monthlyShortfall ? p.danger : p.textSecondary }}>
                  目標日まで月 {formatJPY(plan.monthlyRequired)}
                  {plan.monthlyShortfall && goal.monthlyContribution ? ` · 積立予定より月 ${formatJPY(plan.monthlyShortfall)} 不足` : ''}
                </Text>
              ) : null}
              {goal.monthlyContribution && plan.remaining > 0 ? (
                <Text style={{ color: p.textSecondary }}>
                  毎月 {formatJPY(goal.monthlyContribution)} の予定 · あと {plan.monthsToGoal} か月
                </Text>
              ) : null}
            </View>
            <Row title="積立を記録" chevron onPress={() => {
              setEditor(undefined);
              setDeposit(goal);
              setAmount(goal.monthlyContribution ? String(goal.monthlyContribution) : '');
            }} />
          </Group>
        );
      })}
      {goals.length === 0 ? <Text style={{ color: p.textSecondary }}>貯めたい金額を設定し、実際に貯めた額を記録できます。</Text> : null}
    </>
  );
}

function Purchases({ onBudget }: { onBudget: () => void }) {
  const { state, visibleState, activeLedger, month, setMonth, savePurchaseCandidate, removePurchaseCandidate } = useFinance();
  const p = usePalette();
  const ledgerId = activeLedger?.id;
  const budgets = state.budgets.filter((item) => item.ledgerId === ledgerId);
  const candidates = (state.purchaseCandidates ?? []).filter((item) => item.ledgerId === ledgerId && item.month === month);
  const spending = useMonthlySpending({ visibleState, month });
  const nextSpending = useMonthlySpending({ visibleState, month }, true);
  const [editor, setEditor] = useState<'new' | PurchaseCandidate>();
  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('JPY');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [fee, setFee] = useState('');
  const [category, setCategory] = useState('');
  const edit = (item: 'new' | PurchaseCandidate) => {
    const foreign = item === 'new' ? undefined : item.foreignPrice;
    setEditor(item);
    setTitle(item === 'new' ? '' : item.title);
    setCurrency(foreign?.currency ?? 'JPY');
    setRate(foreign ? String(foreign.yenPerUnit) : '');
    setFee(foreign?.feeJPY ? String(foreign.feeJPY) : '');
    setAmount(item === 'new' ? '' : String(foreign?.amount ?? item.amount));
    setCategory(item === 'new' ? '' : item.categoryId);
  };
  const chooseCurrency = async () => {
    const choice = await pickOne('支払い通貨', PURCHASE_CURRENCIES.map((code) => ({
      id: code, label: CURRENCY_META[code].label, selected: code === currency,
    })));
    const selected = PURCHASE_CURRENCIES.find((code) => code === choice);
    if (selected && selected !== currency) {
      setCurrency(selected);
      setAmount('');
      setRate('');
      setFee('');
    }
  };
  const foreignPrice: ForeignPurchasePrice | undefined = currency !== 'JPY'
    ? { currency, amount: Number(amount), yenPerUnit: Number(rate), feeJPY: Number(fee) }
    : undefined;
  const priceJPY = foreignPrice ? estimatePurchaseJPY(foreignPrice) : Number(amount);
  const evaluate = (id: string, price: number, following = false) =>
    assessPurchase(budgets.find((budget) => budget.categoryId === id)?.monthlyLimit,
      (following ? nextSpending : spending).get(id) ?? 0, price);
  const preview = category && priceJPY && priceJPY > 0 ? evaluate(category, priceJPY) : undefined;
  const status = (result: ReturnType<typeof evaluate>) => result
    ? result.shortfall > 0 ? `購入後に ${formatJPY(result.shortfall)} 超過` : `購入後に ${formatJPY(result.remaining)} 残る`
    : 'カテゴリ予算が未設定';
  const totals = new Map<string, number>();
  for (const item of candidates) {
    totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + item.amount);
  }

  return (
    <>
      <SectionTitle action="追加" onAction={() => edit('new')}>購入候補</SectionTitle>
      {editor ? (
        <>
          <Group>
            <Input label="買いたいもの" value={title} onChange={setTitle} />
            <Row title="支払い通貨" right={currency === 'JPY' ? '日本円' : currency} chevron onPress={() => void chooseCurrency()} />
            {currency === 'JPY' ? <Input label="見込み価格（円）" value={amount} onChange={setAmount} yen /> : (
              <>
                <Input label={`見込み価格（${currency}）`} value={amount} onChange={setAmount} decimal />
                <Input label={`為替レート（1 ${currency} あたり円）`} value={rate} onChange={setRate} decimal />
                <Input label="手数料（円・任意）" value={fee} onChange={setFee} yen />
                {priceJPY ? <Row title="円換算の合計" right={formatJPY(priceJPY)} /> : null}
              </>
            )}
            <Row title="カテゴリ" right={category ? getCategoryById(category).name : '選択'} chevron
              onPress={() => void chooseCategory(category, setCategory)} />
            {category && priceJPY && priceJPY > 0 ? <Row title="この月に買うと" subtitle={status(preview)} /> : null}
          </Group>
          <Actions close={() => setEditor(undefined)} valid={Boolean(title.trim() && category && priceJPY && priceJPY > 0)} save={() => {
            if (!priceJPY) return;
            savePurchaseCandidate({ title: title.trim(), amount: priceJPY, foreignPrice, categoryId: category, month, ledgerId },
              editor === 'new' ? undefined : editor.id);
            setEditor(undefined);
          }} />
        </>
      ) : null}
      {candidates.map((item) => {
        const result = evaluate(item.categoryId, item.amount);
        const following = result?.shortfall ? evaluate(item.categoryId, item.amount, true) : undefined;
        return (
          <Group key={item.id}>
            <Row title={item.title} subtitle={getCategoryById(item.categoryId).name} right={formatJPY(item.amount)}
              chevron onPress={() => edit(item)} onLongPress={() => void confirmRemoval('購入候補を削除しますか？', () => {
                removePurchaseCandidate(item.id);
                if (editor && editor !== 'new' && editor.id === item.id) setEditor(undefined);
              })} />
            {item.foreignPrice ? (
              <Row title={formatForeignCurrency(item.foreignPrice.amount, item.foreignPrice.currency)}
                subtitle={`1 ${item.foreignPrice.currency} = ¥${item.foreignPrice.yenPerUnit.toLocaleString('ja-JP', { maximumFractionDigits: 8 })}`
                  + (item.foreignPrice.feeJPY ? ` · 手数料 ${formatJPY(item.foreignPrice.feeJPY)}` : '')} />
            ) : null}
            <Row title={status(result)} subtitle={result ? `今月の購入上限 ${formatJPY(result.available)}` : '予算を設定すると判定できます'}
              chevron={!result} onPress={result ? undefined : onBudget} />
            {following ? (
              <Row title="翌月に回す" subtitle={`記録済みの支出で試算 · ${status(following)}`} chevron
                onPress={() => {
                  const next = shiftMonth(month, 1);
                  savePurchaseCandidate({ ...item, month: next }, item.id);
                  setMonth(next);
                }} />
            ) : null}
          </Group>
        );
      })}
      {candidates.length > 1 ? (
        <>
          <SectionTitle>候補をすべて買う場合</SectionTitle>
          <Group>
            {Array.from(totals, ([id, price]) => (
              <Row key={id} title={getCategoryById(id).name} right={formatJPY(price)} subtitle={status(evaluate(id, price))} />
            ))}
          </Group>
        </>
      ) : null}
      {candidates.length === 0 ? <Text style={{ color: p.textSecondary }}>候補は試算用に保存され、取引履歴には入りません。</Text> : null}
    </>
  );
}

export default function Planning() {
  const { month, setMonth, activeLedger } = useFinance();
  const [section, setSection] = useState<Section>('budget');
  const key = activeLedger?.id ?? 'all';

  return (
    <>
      <Stack.Screen options={{ title: '予算・計画' }} />
      <Screen automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        <LedgerPicker />
        <Segmented<Section> value={section} onChange={setSection} options={[
          { id: 'budget', label: '予算' }, { id: 'savings', label: '貯金' }, { id: 'purchase', label: '買い物試算' },
        ]} />
        {section !== 'savings' ? <MonthBar month={month} onChange={setMonth} /> : null}
        {section === 'budget' ? <Budgets key={key} /> : null}
        {section === 'savings' ? <Savings key={key} /> : null}
        {section === 'purchase' ? <Purchases key={`${key}-${month}`} onBudget={() => setSection('budget')} /> : null}
      </Screen>
    </>
  );
}
