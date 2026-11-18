import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { getBankCardWithdrawals } from '@dmm/core/utils/creditCard';
import { formatJPY, formatMonthLabel, getTodayString, shiftMonth } from '@dmm/core/utils/format';
import { comparePurchaseCash, type assessPurchase } from '@dmm/core/utils/planning';
import { computeAccountBalances } from '@dmm/core/store/finance';
import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, Row } from './kit';

type BudgetEstimate = ReturnType<typeof assessPurchase>;

export function formatPurchaseBudget(budget: BudgetEstimate): string {
  if (!budget) return '予算未設定';
  return budget.shortfall ? `${formatJPY(budget.shortfall)} 超過` : `残り ${formatJPY(budget.remaining)}`;
}

export function PurchaseCashPreview({ amount, month, budget, nextBudget }: {
  amount: number;
  month: string;
  budget: BudgetEstimate;
  nextBudget: BudgetEstimate;
}) {
  const p = usePalette();
  const { state, visibleState, activeLedger } = useFinance();
  const today = getTodayString();
  const currentMonth = today.slice(0, 7);
  const nextMonth = shiftMonth(month, 1);
  const orderedAccounts = [...visibleState.accounts, ...state.accounts.filter((a) => !visibleState.accounts.some((v) => v.id === a.id))];
  const banks = orderedAccounts.filter((a) => a.type === 'bank' && (!a.currency || a.currency === 'JPY'));
  const goals = state.savingsGoals.filter((goal) => !activeLedger || goal.ledgerId === activeLedger.id);
  const contributionDefault = goals.reduce((sum, goal) => sum + (goal.monthlyContribution ?? 0), 0);
  const [bankId, setBankId] = useState<string>();
  const [source, setSource] = useState<{ kind: 'bank' | 'goal'; id: string }>();
  const [contributionText, setContributionText] = useState<string>();
  const bank = banks.find((account) => account.id === bankId) ?? banks[0];
  const selectedGoal = source?.kind === 'goal' ? goals.find((goal) => goal.id === source.id) : undefined;
  const sourceBank = source?.kind === 'bank' ? banks.find((account) => account.id === source.id && account.id !== bank?.id) : undefined;
  const contribution = contributionText === undefined ? contributionDefault : Number(contributionText);
  const posted = useMemo(() => state.transactions.filter((tx) => tx.date <= today), [state.transactions, today]);
  const balances = useMemo(() => computeAccountBalances({ ...state, transactions: posted }), [state, posted]);

  if (month < currentMonth || !bank) {
    return <Group>
      <Row title="カテゴリ予算" right={formatPurchaseBudget(budget)} />
      <Row title={bank ? '現在残高の試算は今月以降が対象です' : '試算に使える円建て銀行口座がありません'} />
    </Group>;
  }

  const balance = balances[bank.id] ?? 0;
  const due = getBankCardWithdrawals(state.accounts, posted, bank.id, currentMonth, month);
  const nextDue = getBankCardWithdrawals(state.accounts, posted, bank.id, currentMonth, nextMonth);
  const beforePurchase = balance - due.confirmed - due.estimated;
  const sourceDue = sourceBank
    ? getBankCardWithdrawals(state.accounts, posted, sourceBank.id, currentMonth, month)
    : undefined;
  const savings = {
    available: selectedGoal ? Math.max(0, Math.min(selectedGoal.currentAmount, beforePurchase)) :
      sourceBank && sourceDue ? Math.max(0, (balances[sourceBank.id] ?? 0) - sourceDue.confirmed - sourceDue.estimated) : 0,
    sameAccount: Boolean(selectedGoal),
  };
  const result = comparePurchaseCash(balance, due.confirmed + due.estimated, amount, contribution, savings);
  const nextReserve = selectedGoal ? Math.max(0, Math.min(selectedGoal.currentAmount, balance - nextDue.confirmed - nextDue.estimated)) : 0;
  const deferred = comparePurchaseCash(balance, nextDue.confirmed + nextDue.estimated, amount, contribution,
    { available: nextReserve, sameAccount: Boolean(selectedGoal) });
  const anyShortfall = (budget?.shortfall ?? 0) > 0 || result.free < 0;
  const color = (value: number) => value < 0 ? p.danger : p.text;
  const chooseSavings = async () => {
    const choice = await pickOne('貯金の出どころ', [
      { id: 'none', label: '指定なし' },
      ...goals.filter((goal) => goal.currentAmount > 0).map((goal) => ({
        id: `goal:${goal.id}`, label: goal.title, subtitle: '支払口座の中で取り置いている貯金',
      })),
      ...banks.filter((account) => account.id !== bank.id).map((account) => ({
        id: `bank:${account.id}`, label: account.name, subtitle: '別口座の貯金',
      })),
    ]);
    if (choice === null) return;
    if (choice === 'none') setSource(undefined);
    else setSource({ kind: choice.startsWith('goal:') ? 'goal' : 'bank', id: choice.slice(5) });
  };

  return (
    <View style={{ gap: 12 }}>
      <Group>
        <Row title="カテゴリ予算" right={formatPurchaseBudget(budget)} rightColor={budget?.shortfall ? p.danger : undefined} />
        <Row title="支払口座" right={bank.name} chevron={banks.length > 1} onPress={banks.length > 1 ? async () => {
          const choice = await pickOne('支払口座', banks.map((account) => ({ id: account.id, label: account.name, selected: account.id === bank.id })));
          if (choice) { setBankId(choice); setSource(undefined); }
        } : undefined} />
        <Row title="現在の口座残高" right={formatJPY(balance)} />
        <Row title="クレカ引落（確定・未払い）" right={formatJPY(due.confirmed)} />
        <Row title="クレカ引落（利用履歴からの見込み）" right={formatJPY(due.estimated)} />
        <Row title="購入と引落後の口座残高" right={formatJPY(result.bankRemaining)} rightColor={color(result.bankRemaining)} />
      </Group>
      <Group>
        <View style={{ paddingHorizontal: 16, paddingVertical: 9 }}>
          <Text style={{ color: p.textSecondary, fontSize: 13 }}>この口座から今月これから積み立てる額（円）</Text>
          <TextInput accessibilityLabel="今月これから積み立てる額（円）" keyboardType="number-pad"
            value={contributionText ?? (contributionDefault ? String(contributionDefault) : '')} placeholder="0"
            placeholderTextColor={p.textSecondary}
            onChangeText={(value) => setContributionText(value.normalize('NFKC').replace(/[^0-9]/g, '').slice(0, 12))}
            style={{ color: p.text, minHeight: 36, fontSize: 17 }} />
        </View>
        <Row title="貯金の出どころ" right={selectedGoal?.title ?? sourceBank?.name ?? '指定なし'} chevron onPress={() => void chooseSavings()} />
        <Row title="積立・取り置き後に使える残り" right={formatJPY(result.free)} rightColor={color(result.free)}
          subtitle={selectedGoal ? `口座内の貯金 ${formatJPY(savings.available)} を確保` : undefined} />
      </Group>
      {anyShortfall ? (
        <Group>
          <Row title="貯金から出す" right={savings.available && result.savingsUsed ? formatJPY(result.afterSavings) : undefined}
            rightColor={color(result.afterSavings)}
            subtitle={savings.available && result.savingsUsed
              ? `${formatJPY(result.savingsUsed)} を使った後の残り · 貯金は ${formatJPY(savings.available - result.savingsUsed)} 残る`
              : savings.available ? '手元資金に不足なし' : '貯金の出どころを選ぶと試算できます'} />
          <Row title="今月だけ積立を減らす" right={result.contributionCut ? formatJPY(result.afterContributionCut) : undefined}
            rightColor={color(result.afterContributionCut)}
            subtitle={result.contributionCut
              ? `${formatJPY(result.contributionCut)} 減らした後の残り · 今月の積立 ${formatJPY(contribution - result.contributionCut)}`
              : contribution ? '手元資金に不足なし' : 'これから積み立てる額を入れると比較できます'} />
          <Row title={`${formatMonthLabel(nextMonth)}に回す`} right={formatJPY(deferred.free)} rightColor={color(deferred.free)}
            subtitle={`手元の残り · カテゴリ予算 ${formatPurchaseBudget(nextBudget)}`} />
        </Group>
      ) : null}
      <Text style={{ color: p.textSecondary, fontSize: 12, paddingHorizontal: 4 }}>
        選択月末までの引落を差し引く試算です。今後の入金は含めず、取引・積立・購入予定月は変わりません。
      </Text>
    </View>
  );
}
