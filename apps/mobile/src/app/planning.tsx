import { useMemo, useState } from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';
import { Stack, router } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import type { Budget, SavingsGoal } from '@dmm/core/types/finance';
import { formatFullDate, formatJPY, getTodayString } from '@dmm/core/utils/format';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { assessPurchase, isPlanningDate, planSavings } from '@dmm/core/utils/planning';
import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, MonthBar, Row, Screen, SectionTitle, Segmented } from '@/ui/kit';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { PlanningInput as Input, PlanningActions as Actions } from '@/ui/PlanningForm';
import { formatPurchaseBudget } from '@/ui/PurchaseCashPreview';
import { PurchaseDeleteDialog, type PurchaseDeleteAnchor } from '@/ui/PurchaseDeleteDialog';
import { pickCategory } from '@/lib/categoryPicker';
import { categoryIcon } from '@/lib/categoryIcons';

type Section = 'budget' | 'savings' | 'purchase';
type PlanningData = Pick<ReturnType<typeof useFinance>, 'visibleState' | 'month'>;
async function confirmRemoval(title: string, onRemove: () => void) {
  const choice = await pickOne(title, [{ id: 'remove', label: '削除', destructive: true }]);
  if (choice === 'remove') onRemove();
}

function useMonthlySpending({ visibleState, month }: PlanningData) {
  return useMemo(() => new Map(computeMonthMetrics(visibleState, month).categoryBreakdown.map(({ categoryId, amount }) => [
    categoryId, amount,
  ])), [visibleState, month]);
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
  const selected = getCategoryById(category, state.customCategories);
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
              onPress={editing === 'new' ? () => void pickCategory('expense', category, state, (id) => {
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
            <Row key={budget.categoryId} title={getCategoryById(budget.categoryId, state.customCategories).name}
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

function Purchases() {
  const { state, visibleState, activeLedger, month, removePurchaseCandidate } = useFinance();
  const p = usePalette();
  const [deletion, setDeletion] = useState<{ id: string; anchor: PurchaseDeleteAnchor }>();
  const ledgerId = activeLedger?.id;
  const budgets = state.budgets.filter((budget) => budget.ledgerId === ledgerId);
  const candidates = (state.purchaseCandidates ?? []).filter((item) => item.ledgerId === ledgerId && item.month === month);
  const pendingDelete = candidates.find((item) => item.id === deletion?.id);
  const spending = useMonthlySpending({ visibleState, month });
  const totals = new Map<string, number>();
  for (const item of candidates) totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + item.amount);

  return (
    <>
      <SectionTitle action="追加" onAction={() => router.push('/purchase-editor')}>購入候補</SectionTitle>
      {candidates.map((item) => {
        const category = getCategoryById(item.categoryId, state.customCategories);
        const budget = assessPurchase(budgets.find((entry) => entry.categoryId === item.categoryId)?.monthlyLimit,
          spending.get(item.categoryId) ?? 0, item.amount);
        return (
          <Group key={item.id}>
            <Row title={item.title} subtitle={category.name} right={formatJPY(item.amount)}
              icon={categoryIcon(category.icon ?? category.id)} iconColor={category.color} />
            <Row title="購入後のカテゴリ予算" right={formatPurchaseBudget(budget)} rightColor={budget?.shortfall ? p.danger : undefined} />
            <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 5, gap: 4 }}>
              <PurchaseAction label="試算" color={p.tint} onPress={() => router.push({ pathname: '/purchase-compare', params: { id: item.id } })} />
              <PurchaseAction label="編集" color={p.text} onPress={() => router.push({ pathname: '/purchase-editor', params: { id: item.id } })} />
              <PurchaseAction label="削除" color={p.danger}
                onPress={({ nativeEvent }) => setDeletion({ id: item.id, anchor: { x: nativeEvent.pageX, y: nativeEvent.pageY } })} />
            </View>
          </Group>
        );
      })}
      {candidates.length > 1 ? (
        <>
          <SectionTitle>候補をすべて買う場合</SectionTitle>
          <Group>
            {Array.from(totals, ([id, price]) => (
              <Row key={id} title={getCategoryById(id, state.customCategories).name} right={formatJPY(price)}
                subtitle={formatPurchaseBudget(assessPurchase(budgets.find((entry) => entry.categoryId === id)?.monthlyLimit,
                  spending.get(id) ?? 0, price))} />
            ))}
          </Group>
        </>
      ) : null}
      {candidates.length === 0 ? <Text style={{ color: p.textSecondary }}>候補を追加すると、予算と購入後の残高を試算できます。</Text> : null}
      <PurchaseDeleteDialog title={pendingDelete?.title} anchor={deletion?.anchor} onCancel={() => setDeletion(undefined)} onDelete={() => {
        if (pendingDelete) removePurchaseCandidate(pendingDelete.id);
        setDeletion(undefined);
      }} />
    </>
  );
}

function PurchaseAction({ label, color, onPress }: { label: string; color: string; onPress: NonNullable<PressableProps['onPress']> }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center',
        borderRadius: 10, backgroundColor: pressed ? p.fill : 'transparent' })}>
      <Text style={{ color, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
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
        {section === 'purchase' ? <Purchases key={`${key}-${month}`} /> : null}
      </Screen>
    </>
  );
}
