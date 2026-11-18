import { useMemo, useState } from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';
import { Stack, router } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import type { SavingsGoal } from '@dmm/core/types/finance';
import { formatFullDate, formatJPY, getTodayString } from '@dmm/core/utils/format';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { filterLedger } from '@dmm/core/utils/ledgers';
import { assessPurchase, isPlanningDate, planSavings } from '@dmm/core/utils/planning';
import { buildPurchaseTransaction, groupPurchases, markPurchased, PRIORITY_LABELS, revertToCandidate } from '@dmm/core/utils/purchasePlan';
import { success } from '@/lib/haptics';
import { BudgetPie } from '@/ui/PurchaseInsights';
import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, MonthBar, Row, Screen, SectionTitle, Segmented } from '@/ui/kit';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { PlanningInput as Input, PlanningActions as Actions } from '@/ui/PlanningForm';
import { formatPurchaseBudget } from '@/ui/PurchaseCashPreview';
import { AnchoredDeleteDialog } from '@/ui/AnchoredDeleteDialog';
import type { PopoverAnchor } from '@/ui/AnchoredPopover';
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
  const { state, activeLedger, visibleState, month } = useFinance();
  const p = usePalette();
  const ledgerId = activeLedger?.id;
  const budgets = state.budgets.filter((item) => item.ledgerId === ledgerId);
  const spending = useMonthlySpending({ visibleState, month });
  const openEditor = (categoryId?: string) => {
    router.push({ pathname: '/budget-editor', params: { categoryId, ledgerId } });
  };
  const spent = budgets.reduce((sum, item) => sum + (spending.get(item.categoryId) ?? 0), 0);
  const limit = budgets.reduce((sum, item) => sum + item.monthlyLimit, 0);

  return (
    <>
      <SectionTitle action="追加" onAction={() => openEditor()}>月間予算</SectionTitle>
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
              rightColor={remaining < 0 ? p.danger : undefined} chevron onPress={() => openEditor(budget.categoryId)} />
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
  const { state, activeLedger, ledgers, month, removePurchaseCandidate, savePurchaseCandidate, addTransaction } = useFinance();
  const p = usePalette();
  const [deletion, setDeletion] = useState<{ id: string; anchor: PopoverAnchor }>();
  const ledgerId = activeLedger?.id;
  const inView = (state.purchaseCandidates ?? []).filter((item) => (!ledgerId || item.ledgerId === ledgerId) && item.month === month);
  const { candidates, confirmed, purchased } = groupPurchases(inView);
  const pendingDelete = inView.find((item) => item.id === deletion?.id);
  const accountName = (id?: string) => state.accounts.find((a) => a.id === id)?.name ?? '口座未設定';
  const buy = (item: (typeof inView)[number]) => {
    const today = getTodayString();
    addTransaction(buildPurchaseTransaction(item, item.accountId ?? state.accounts[0]?.id ?? '', today));
    const { id, ...rest } = item;
    void id;
    savePurchaseCandidate(markPurchased({ id: item.id, ...rest }, today), item.id);
    success();
  };
  const spendingByGroup = useMemo(() => {
    const groups = new Set((state.purchaseCandidates ?? []).filter((item) => item.month === month).map((item) => item.ledgerId));
    return new Map(Array.from(groups, (groupId) => [
      groupId,
      new Map(computeMonthMetrics(filterLedger(state, groupId ?? null), month).categoryBreakdown.map(({ categoryId, amount }) => [categoryId, amount])),
    ]));
  }, [state, month]);
  const estimate = (groupId: string | undefined, categoryId: string, amount: number) =>
    assessPurchase(state.budgets.find((entry) => entry.ledgerId === groupId && entry.categoryId === categoryId)?.monthlyLimit,
      spendingByGroup.get(groupId)?.get(categoryId) ?? 0, amount);
  const groupName = (id?: string) => ledgers.find((ledger) => ledger.id === id)?.name ?? '選択なし';
  const totals = new Map<string | undefined, Map<string, number>>();
  for (const item of candidates) {
    let totalsByCategory = totals.get(item.ledgerId);
    if (!totalsByCategory) {
      totalsByCategory = new Map();
      totals.set(item.ledgerId, totalsByCategory);
    }
    totalsByCategory.set(item.categoryId, (totalsByCategory.get(item.categoryId) ?? 0) + item.amount);
  }

  return (
    <>
      {confirmed.length > 0 ? (
        <>
          <SectionTitle>購入予定（確定済み）</SectionTitle>
          {confirmed.map((item) => {
            const category = getCategoryById(item.categoryId, state.customCategories);
            return (
              <Group key={item.id}>
                <Row title={item.title}
                  subtitle={`${item.plannedDate ? formatFullDate(item.plannedDate) : ''} · ${accountName(item.accountId)}${item.installment && item.installment.count > 1 ? ` · ${item.installment.count}回払い` : ''}`}
                  right={formatJPY(item.amount)} icon={categoryIcon(category.icon ?? category.id)} iconColor={category.color} />
                <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 5, gap: 4 }}>
                  <PurchaseAction label="購入した" color={p.tint} onPress={() => buy(item)} />
                  <PurchaseAction label="調整" color={p.text} onPress={() => router.push({ pathname: '/purchase-confirm', params: { id: item.id } })} />
                  <PurchaseAction label="候補に戻す" color={p.text} onPress={() => {
                    const { id, ...rest } = item;
                    void id;
                    savePurchaseCandidate(revertToCandidate({ id: item.id, ...rest }), item.id);
                  }} />
                </View>
              </Group>
            );
          })}
        </>
      ) : null}
      <SectionTitle action="追加" onAction={() => router.push('/purchase-editor')}>購入候補</SectionTitle>
      {candidates.map((item) => {
        const category = getCategoryById(item.categoryId, state.customCategories);
        const budget = estimate(item.ledgerId, item.categoryId, item.amount);
        return (
          <Group key={item.id}>
            <Row title={item.title} subtitle={`${item.priority ? `${PRIORITY_LABELS[item.priority]} · ` : ''}${ledgerId ? category.name : `${category.name} · ${groupName(item.ledgerId)}`}${item.installment && item.installment.count > 1 ? ` · ${item.installment.count}回払い` : ''}`} right={formatJPY(item.amount)}
              icon={categoryIcon(category.icon ?? category.id)} iconColor={category.color} />
            <Row title="購入後のカテゴリ予算" right={formatPurchaseBudget(budget)} rightColor={budget?.shortfall ? p.danger : undefined} />
            <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 5, gap: 4 }}>
              <PurchaseAction label="試算" color={p.tint} onPress={() => router.push({ pathname: '/purchase-compare', params: { id: item.id } })} />
              <PurchaseAction label="確定" color={p.tint} onPress={() => router.push({ pathname: '/purchase-confirm', params: { id: item.id } })} />
              <PurchaseAction label="編集" color={p.text} onPress={() => router.push({ pathname: '/purchase-editor', params: { id: item.id } })} />
              <PurchaseAction label="削除" color={p.danger}
                onPress={({ nativeEvent }) => setDeletion({ id: item.id, anchor: { x: nativeEvent.pageX, y: nativeEvent.pageY } })} />
            </View>
          </Group>
        );
      })}
      {candidates.length + confirmed.length > 0 ? (
        <BudgetPie month={month} ledgerId={ledgerId} title={candidates.length + confirmed.length > 1 ? '予定をすべて実行した場合の予算' : undefined}
          extras={[...confirmed, ...candidates].map((item) => ({ categoryId: item.categoryId, amount: item.amount }))} />
      ) : null}
      {candidates.length > 1 ? (
        <>
          <SectionTitle>候補をすべて買う場合</SectionTitle>
          <Group>
            {Array.from(totals, ([groupId, byCategory]) => Array.from(byCategory, ([id, price]) => (
              <Row key={`${groupId ?? ''}:${id}`} title={getCategoryById(id, state.customCategories).name} right={formatJPY(price)}
                subtitle={`${ledgerId ? '' : `${groupName(groupId)} · `}${formatPurchaseBudget(estimate(groupId, id, price))}`} />
            ))).flat()}
          </Group>
        </>
      ) : null}
      {purchased.length > 0 ? (
        <>
          <SectionTitle>購入済み</SectionTitle>
          <Group>
            {purchased.map((item) => {
              const category = getCategoryById(item.categoryId, state.customCategories);
              return <Row key={item.id} title={item.title} subtitle={item.purchasedAt ? formatFullDate(item.purchasedAt) : ''} right={formatJPY(item.amount)}
                icon={categoryIcon(category.icon ?? category.id)} iconColor={category.color}
                onPress={({ nativeEvent }: { nativeEvent: { pageX: number; pageY: number } }) => setDeletion({ id: item.id, anchor: { x: nativeEvent.pageX, y: nativeEvent.pageY } })} />;
            })}
          </Group>
        </>
      ) : null}
      {candidates.length + confirmed.length + purchased.length === 0 ? <Text style={{ color: p.textSecondary }}>候補を追加すると、予算と購入後の残高を試算できます。</Text> : null}
      <AnchoredDeleteDialog heading="購入候補を削除しますか？" title={pendingDelete?.title} anchor={deletion?.anchor} onCancel={() => setDeletion(undefined)} onDelete={() => {
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
