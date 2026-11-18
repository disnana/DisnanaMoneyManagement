import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { getBankCardWithdrawals } from '@dmm/core/utils/creditCard';
import { formatJPY, formatMonthLabel, getTodayString, shiftMonth } from '@dmm/core/utils/format';
import { comparePurchaseCash, type assessPurchase } from '@dmm/core/utils/planning';
import { filterLedger } from '@dmm/core/utils/ledgers';
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

export function PurchaseCashPreview({ amount, month, ledgerId, budget, nextBudget, categorySelected = true }: {
  amount?: number;
  month: string;
  ledgerId?: string;
  budget: BudgetEstimate;
  nextBudget: BudgetEstimate;
  categorySelected?: boolean;
}) {
  const p = usePalette();
  const { state } = useFinance();
  const today = getTodayString();
  const currentMonth = today.slice(0, 7);
  const nextMonth = shiftMonth(month, 1);
  const scopedAccounts = useMemo(() => filterLedger(state, ledgerId ?? null).accounts, [state, ledgerId]);
  const orderedAccounts = [...scopedAccounts, ...state.accounts.filter((a) => !scopedAccounts.some((v) => v.id === a.id))];
  const banks = orderedAccounts.filter((a) => a.type === 'bank' && (!a.currency || a.currency === 'JPY'));
  const goals = state.savingsGoals.filter((goal) => !ledgerId || goal.ledgerId === ledgerId);
  const contributionDefault = goals.reduce((sum, goal) => sum + (goal.monthlyContribution ?? 0), 0);
  const [bankId, setBankId] = useState<string>();
  const [source, setSource] = useState<{ kind: 'bank' | 'goal'; id: string }>();
  const [contributionText, setContributionText] = useState<string>();
  const [adjusting, setAdjusting] = useState(false);
  const budgetValue = categorySelected ? formatPurchaseBudget(budget) : 'カテゴリを選択';
  const bank = banks.find((account) => account.id === bankId) ?? banks[0];
  const selectedGoal = source?.kind === 'goal' ? goals.find((goal) => goal.id === source.id) : undefined;
  const sourceBank = source?.kind === 'bank' ? banks.find((account) => account.id === source.id && account.id !== bank?.id) : undefined;
  const contribution = contributionText === undefined ? contributionDefault : Number(contributionText);
  const posted = useMemo(() => state.transactions.filter((tx) => tx.date <= today), [state.transactions, today]);
  const balances = useMemo(() => computeAccountBalances({ ...state, transactions: posted }), [state, posted]);

  if (month < currentMonth || !bank) {
    return <Group>
      <Row title="予算残り" right={budgetValue} />
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
  const result = comparePurchaseCash(balance, due.confirmed + due.estimated, amount ?? 0, contribution, savings);
  const nextReserve = selectedGoal ? Math.max(0, Math.min(selectedGoal.currentAmount, balance - nextDue.confirmed - nextDue.estimated)) : 0;
  const deferred = comparePurchaseCash(balance, nextDue.confirmed + nextDue.estimated, amount ?? 0, contribution,
    { available: nextReserve, sameAccount: Boolean(selectedGoal) });
  const anyShortfall = amount !== undefined && ((budget?.shortfall ?? 0) > 0 || result.free < 0);
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 16 }}>
          <CashMetric label={amount === undefined ? '引落後の残高' : '購入・引落後の残高'} value={formatJPY(result.bankRemaining)}
            color={color(result.bankRemaining)} primary />
          <CashMetric label="予算残り" value={budget && !budget.shortfall ? formatJPY(budget.remaining) : budgetValue}
            color={budget?.shortfall ? p.danger : p.text} primary />
        </View>
        <Row title="支払口座" right={bank.name} chevron={banks.length > 1} onPress={banks.length > 1 ? async () => {
          const choice = await pickOne('支払口座', banks.map((account) => ({ id: account.id, label: account.name, selected: account.id === bank.id })));
          if (choice) { setBankId(choice); setSource(undefined); }
        } : undefined} />
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: p.textSecondary, fontSize: 12 }}>口座残高とカード引落の内訳</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <CashMetric label="現在残高" value={formatJPY(balance)} color={p.text} />
            <CashMetric label="引落・確定" value={formatJPY(due.confirmed)} color={p.text} />
            <CashMetric label="引落・見込み" value={formatJPY(due.estimated)} color={p.text} />
          </View>
        </View>
      </Group>
      <Group>
        <Row title={adjusting ? '貯金・積立の調整を閉じる' : '貯金・積立を調整'} chevron onPress={() => setAdjusting((value) => !value)} />
        {adjusting ? (
          <>
            <View style={{ paddingHorizontal: 16, paddingVertical: 9 }}>
              <Text style={{ color: p.textSecondary, fontSize: 13 }}>この口座からの今月の積立（円）</Text>
              <TextInput accessibilityLabel="この口座からの今月の積立（円）" keyboardType="number-pad"
                value={contributionText ?? (contributionDefault ? String(contributionDefault) : '')} placeholder="0"
                placeholderTextColor={p.textSecondary}
                onChangeText={(value) => setContributionText(value.normalize('NFKC').replace(/[^0-9]/g, '').slice(0, 12))}
                style={{ color: p.text, minHeight: 36, fontSize: 17 }} />
            </View>
            <Row title="貯金の出どころ" right={selectedGoal?.title ?? sourceBank?.name ?? '指定なし'} chevron onPress={() => void chooseSavings()} />
          </>
        ) : null}
        {adjusting || contribution > 0 || selectedGoal ? (
          <Row title="手元に残る額" right={formatJPY(result.free)} rightColor={color(result.free)}
            subtitle={selectedGoal ? `積立と貯金 ${formatJPY(savings.available)} を確保後` : '積立を確保後'} />
        ) : null}
      </Group>
      {anyShortfall ? (
        <Group>
          <Row title="貯金から出す" right={savings.available && result.savingsUsed ? formatJPY(result.afterSavings) : undefined}
            rightColor={color(result.afterSavings)}
            subtitle={savings.available && result.savingsUsed
              ? `${formatJPY(result.savingsUsed)} を使う · 貯金残り ${formatJPY(savings.available - result.savingsUsed)}`
              : savings.available ? '手元資金に不足なし' : '貯金の出どころを選択'} />
          <Row title="今月だけ積立を減らす" right={result.contributionCut ? formatJPY(result.afterContributionCut) : undefined}
            rightColor={color(result.afterContributionCut)}
            subtitle={result.contributionCut
              ? `今月は ${formatJPY(result.contributionCut)} 減額`
              : contribution ? '手元資金に不足なし' : '今月の積立額を入力'} />
          <Row title={`${formatMonthLabel(nextMonth)}に回す`} right={formatJPY(deferred.free)} rightColor={color(deferred.free)}
            subtitle={`手元の残り · カテゴリ予算 ${formatPurchaseBudget(nextBudget)}`} />
        </Group>
      ) : null}
      {adjusting ? <Text style={{ color: p.textSecondary, fontSize: 12, paddingHorizontal: 4 }}>月末までの引落を反映。今後の入金は試算対象外です。</Text> : null}
    </View>
  );
}

function CashMetric({ label, value, color, primary }: {
  label: string; value: string; color: string; primary?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, minWidth: primary ? 120 : 72, gap: 4 }}>
      <Text style={{ color: p.textSecondary, fontSize: 12 }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color, fontSize: primary ? 23 : 14,
        fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}
