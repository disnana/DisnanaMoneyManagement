import { useMemo, useState } from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';
import { Stack, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { getCategoryById, getOrderedCategories } from '@dmm/core/data/categories';
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
import { Group, IconBadge, MonthBar, Row, Screen, SectionTitle, Segmented } from '@/ui/kit';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { PlanningInput as Input, PlanningActions as Actions } from '@/ui/PlanningForm';
import { formatPurchaseBudget } from '@/ui/PurchaseCashPreview';
import { AnchoredDeleteDialog } from '@/ui/AnchoredDeleteDialog';
import type { PopoverAnchor } from '@/ui/AnchoredPopover';
import { categoryIcon } from '@/lib/categoryIcons';
import { PlanningProgress, PlanningSummary } from '@/ui/PlanningSummary';

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
  const categories = getOrderedCategories('expense', state.customCategories, state.categoryOrder?.expense, state.hiddenCategoryIds);
  const ranks = new Map(categories.map((category, index) => [category.id, index]));
  const rank = (id: string) => ranks.get(id) ?? categories.length;
  const budgets = state.budgets.filter((item) => item.ledgerId === ledgerId)
    .sort((a, b) => rank(a.categoryId) - rank(b.categoryId));
  const spending = useMonthlySpending({ visibleState, month });
  const openEditor = (categoryId?: string) => {
    router.push({ pathname: '/budget-editor', params: { categoryId, ledgerId } });
  };
  const spent = budgets.reduce((sum, item) => sum + (spending.get(item.categoryId) ?? 0), 0);
  const limit = budgets.reduce((sum, item) => sum + item.monthlyLimit, 0);
  const remaining = limit - spent;
  const exceeded = budgets.filter((item) => (spending.get(item.categoryId) ?? 0) > item.monthlyLimit).length;

  return (
    <>
      {budgets.length > 0 ? (
        <PlanningSummary label={remaining < 0 ? '月間予算の超過' : '月間予算の残り'}
          value={formatJPY(Math.abs(remaining))} color={remaining < 0 ? p.danger : p.income}
          detail={`${formatJPY(spent)} 使用 / ${formatJPY(limit)}`}>
          <PlanningProgress amount={spent} total={limit} color={remaining < 0 ? p.danger : p.tint} label="月間予算の使用率" />
          {exceeded > 0 ? <Text style={{ color: p.danger, fontSize: 13, fontWeight: '600' }}>{exceeded}カテゴリが予算超過</Text> : null}
        </PlanningSummary>
      ) : null}

      <SectionTitle action={budgets.length ? '追加' : undefined} onAction={() => openEditor()}>カテゴリ別の予算</SectionTitle>
      <Group>
        {budgets.length === 0 ? (
          <Row title="予算を追加" subtitle="カテゴリごとに毎月の上限を設定"
            icon={{ ios: 'plus.circle', android: 'add_circle' }} chevron onPress={() => openEditor()} />
        ) : budgets.map((budget) => {
          const category = getCategoryById(budget.categoryId, state.customCategories);
          const used = spending.get(budget.categoryId) ?? 0;
          const balance = budget.monthlyLimit - used;
          const balanceLabel = balance < 0 ? '超過' : '残り';
          return (
            <Pressable key={budget.categoryId} accessibilityRole="button"
              accessibilityLabel={`${category.name}、${balanceLabel} ${formatJPY(Math.abs(balance))}、${formatJPY(used)} 使用`}
              onPress={() => openEditor(budget.categoryId)} style={({ pressed }) => ({
                paddingHorizontal: 14, paddingVertical: 10, gap: 8, backgroundColor: pressed ? p.fill : p.card,
              })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <IconBadge name={categoryIcon(category.icon ?? category.id)} color={category.color} size={34} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={2} style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{category.name}</Text>
                  <Text style={{ color: p.textSecondary, fontSize: 12 }}>{formatJPY(used)} / {formatJPY(budget.monthlyLimit)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ color: balance < 0 ? p.danger : p.textSecondary, fontSize: 11 }}>{balanceLabel}</Text>
                  <Text style={{ color: balance < 0 ? p.danger : p.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                    {formatJPY(Math.abs(balance))}
                  </Text>
                </View>
                <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={12} tintColor={p.textSecondary} />
              </View>
              <PlanningProgress amount={used} total={budget.monthlyLimit} color={balance < 0 ? p.danger : category.color}
                label={`${category.name}の予算使用率`} />
            </Pressable>
          );
        })}
      </Group>
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
  const saved = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const achieved = goals.filter((goal) => goal.currentAmount >= goal.targetAmount).length;

  return (
    <>
      {goals.length > 0 ? <PlanningSummary label="貯めた金額" value={formatJPY(saved)} color={p.income}
        detail={`達成 ${achieved} / ${goals.length} 件`} /> : null}
      <SectionTitle action={goals.length ? '追加' : undefined} onAction={() => edit('new')}>貯金目標</SectionTitle>
      {editor ? (
        <>
          <Group>
            <Row title={editor === 'new' ? '貯金目標を追加' : '貯金目標を編集'} />
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
              chevron
              onPress={() => edit(goal)} onLongPress={() => void confirmRemoval('貯金目標を削除しますか？', () => {
                deleteSavingsGoal(goal.id);
                if (editor && editor !== 'new' && editor.id === goal.id) setEditor(undefined);
                if (deposit?.id === goal.id) setDeposit(undefined);
              })} />
            <View style={{ padding: 14, gap: 9 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: p.income, fontSize: 23, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {formatJPY(goal.currentAmount)}
                </Text>
                <Text style={{ color: p.textSecondary, fontSize: 13 }}>目標 {formatJPY(goal.targetAmount)}</Text>
              </View>
              <PlanningProgress amount={goal.currentAmount} total={goal.targetAmount} color={p.tint} label={`${goal.title}の達成率`} />
              <Text style={{ color: plan.overdue ? p.danger : p.text, fontSize: 13, fontWeight: '600' }}>
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
      {goals.length === 0 && !editor ? (
        <Group><Row title="貯金目標を追加" subtitle="目標額を決めて、積立を記録"
          icon={{ ios: 'plus.circle', android: 'add_circle' }} chevron onPress={() => edit('new')} /></Group>
      ) : null}
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
  const planned = [...confirmed, ...candidates];
  const plannedTotal = planned.reduce((sum, item) => sum + item.amount, 0);
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
      {planned.length > 0 ? (
        <PlanningSummary label="購入候補・予定の合計" value={formatJPY(plannedTotal)}
          detail={`候補 ${candidates.length} 件 · 確定 ${confirmed.length} 件`} />
      ) : null}
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
                  <PurchaseAction label="購入を記録" color={p.tint} primary onPress={() => buy(item)} />
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
      <SectionTitle action={candidates.length ? "追加" : undefined} onAction={() => router.push('/purchase-editor')}>購入候補</SectionTitle>
      {candidates.map((item) => {
        const category = getCategoryById(item.categoryId, state.customCategories);
        const budget = estimate(item.ledgerId, item.categoryId, item.amount);
        return (
          <Group key={item.id}>
            <Row title={item.title} subtitle={`${item.priority ? `${PRIORITY_LABELS[item.priority]} · ` : ''}${ledgerId ? category.name : `${category.name} · ${groupName(item.ledgerId)}`}${item.installment && item.installment.count > 1 ? ` · ${item.installment.count}回払い` : ''}`} right={formatJPY(item.amount)}
              icon={categoryIcon(category.icon ?? category.id)} iconColor={category.color} />
            <Row title="購入後のカテゴリ予算" right={formatPurchaseBudget(budget)} rightColor={budget?.shortfall ? p.danger : undefined} />
            <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 5, gap: 4 }}>
              <PurchaseAction label="試算を見る" color={p.tint} primary onPress={() => router.push({ pathname: '/purchase-compare', params: { id: item.id } })} />
              <PurchaseAction label="予定にする" color={p.text} onPress={() => router.push({ pathname: '/purchase-confirm', params: { id: item.id } })} />
              <PurchaseAction label="編集" color={p.text} onPress={() => router.push({ pathname: '/purchase-editor', params: { id: item.id } })} />
              <PurchaseAction label="削除" color={p.danger}
                onPress={({ nativeEvent }) => setDeletion({ id: item.id, anchor: { x: nativeEvent.pageX, y: nativeEvent.pageY } })} />
            </View>
          </Group>
        );
      })}
      {candidates.length + confirmed.length > 0 ? (
        <BudgetPie month={month} ledgerId={ledgerId} title={candidates.length + confirmed.length > 1 ? '予定をすべて実行した場合の予算' : undefined}
          extras={planned.map((item) => ({ categoryId: item.categoryId, amount: item.amount }))} />
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
      {candidates.length === 0 ? (
        <Group><Row title="購入候補を追加" subtitle="購入後の予算や残高を試算"
          icon={{ ios: 'plus.circle', android: 'add_circle' }} chevron onPress={() => router.push('/purchase-editor')} /></Group>
      ) : null}
      <AnchoredDeleteDialog heading="購入候補を削除しますか？" title={pendingDelete?.title} anchor={deletion?.anchor} onCancel={() => setDeletion(undefined)} onDelete={() => {
        if (pendingDelete) removePurchaseCandidate(pendingDelete.id);
        setDeletion(undefined);
      }} />
    </>
  );
}

function PurchaseAction({ label, color, primary, onPress }: { label: string; color: string; primary?: boolean; onPress: NonNullable<PressableProps['onPress']> }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center',
        borderRadius: 10, backgroundColor: primary ? p.tint : pressed ? p.fill : 'transparent', opacity: primary && pressed ? 0.8 : 1 })}>
      <Text style={{ color: primary ? p.onTint : color, fontSize: 14, fontWeight: '700' }}>{label}</Text>
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
