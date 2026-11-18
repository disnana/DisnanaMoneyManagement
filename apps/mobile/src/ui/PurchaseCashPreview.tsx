import { useMemo, useState } from 'react';
import { Text, TextInput, View, type GestureResponderEvent } from 'react-native';
import type { Account } from '@dmm/core/types/finance';
import { getBankCardWithdrawals } from '@dmm/core/utils/creditCard';
import { formatJPY, formatMonthLabel, getTodayString, shiftMonth } from '@dmm/core/utils/format';
import { comparePurchaseCash, type assessPurchase } from '@dmm/core/utils/planning';
import { filterLedger } from '@dmm/core/utils/ledgers';
import { computeAccountBalances } from '@dmm/core/store/finance';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { pickNear } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, Row, SectionTitle, Segmented } from './kit';

type BudgetEstimate = ReturnType<typeof assessPurchase>;
type CashTab = 'balance' | 'savings';

export function formatPurchaseBudget(budget: BudgetEstimate): string {
  if (!budget) return '予算未設定';
  return budget.shortfall ? `${formatJPY(budget.shortfall)} 超過` : `残り ${formatJPY(budget.remaining)}`;
}

export function usePurchaseBank(ledgerId?: string) {
  const { state } = useFinance();
  const [selection, setSelection] = useState<{ ledgerId?: string; id: string }>();
  const banks = useMemo(() => {
    const scoped = new Set(filterLedger(state, ledgerId ?? null).accounts.map((account) => account.id));
    const accounts = state.accounts.filter((item) => item.type === 'bank' && (!item.currency || item.currency === 'JPY'));
    return [...accounts.filter((account) => scoped.has(account.id)), ...accounts.filter((account) => !scoped.has(account.id))];
  }, [state, ledgerId]);
  const bank = selection && selection.ledgerId === ledgerId ? banks.find((account) => account.id === selection.id) : undefined;
  return { banks, bank: bank ?? banks[0], setBankId: (id: string) => setSelection({ ledgerId, id }) };
}

export function PurchaseBankPicker({ banks, bank, setBankId }: ReturnType<typeof usePurchaseBank>) {
  return (
    <Row title="支払口座" right={bank?.name ?? '対象の口座なし'} chevron={banks.length > 1}
      onPress={banks.length > 1 ? async (event) => {
        const choice = await pickNear(event, '支払口座', banks.map((account) => ({
          id: account.id, label: account.name, icon: ACCOUNT_ICONS.bank, selected: account.id === bank?.id,
        })));
        if (choice) setBankId(choice);
      } : undefined} />
  );
}

export function PurchaseCashPreview({ amount, month, ledgerId, bank, banks, budget, nextBudget, categorySelected = true }: {
  amount?: number;
  month: string;
  ledgerId?: string;
  bank?: Account;
  banks: Account[];
  budget: BudgetEstimate;
  nextBudget: BudgetEstimate;
  categorySelected?: boolean;
}) {
  const p = usePalette();
  const { state } = useFinance();
  const today = getTodayString();
  const currentMonth = today.slice(0, 7);
  const nextMonth = shiftMonth(month, 1);
  const goals = state.savingsGoals.filter((goal) => !ledgerId || goal.ledgerId === ledgerId);
  const contributionDefault = goals.reduce((sum, goal) => sum + (goal.monthlyContribution ?? 0), 0);
  const [savedSource, setSource] = useState<{ kind: 'bank' | 'goal'; id: string; forBankId: string }>();
  const [contributionText, setContributionText] = useState<string>();
  const [tab, setTab] = useState<CashTab>('balance');
  const budgetValue = categorySelected ? formatPurchaseBudget(budget) : 'カテゴリを選択';
  const source = savedSource?.forBankId === bank?.id ? savedSource : undefined;
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
  const cashCap = Math.max(0, result.free + (amount ?? 0));
  const purchaseCap = budget ? Math.min(budget.available, cashCap) : cashCap;
  const gaps = [
    budget?.shortfall ? `予算を ${formatJPY(budget.shortfall)} 超過` : '',
    result.free < 0 ? `手元資金が ${formatJPY(-result.free)} 不足` : '',
  ].filter(Boolean);
  const color = (value: number) => value < 0 ? p.danger : p.text;
  const chooseSavings = async (event: GestureResponderEvent) => {
    const choice = await pickNear(event, '貯金の出どころ', [
      { id: 'none', label: '指定なし', selected: !source },
      ...goals.filter((goal) => goal.currentAmount > 0).map((goal) => ({
        id: `goal:${goal.id}`, label: goal.title, subtitle: '支払口座の中で取り置いている貯金',
        icon: { ios: 'target', android: 'track_changes' } as const, selected: selectedGoal?.id === goal.id,
      })),
      ...banks.filter((account) => account.id !== bank.id).map((account) => ({
        id: `bank:${account.id}`, label: account.name, subtitle: '別口座の貯金',
        icon: ACCOUNT_ICONS.bank, selected: sourceBank?.id === account.id,
      })),
    ]);
    if (choice === null) return;
    if (choice === 'none') setSource(undefined);
    else setSource({ kind: choice.startsWith('goal:') ? 'goal' : 'bank', id: choice.slice(5), forBankId: bank.id });
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
        <Row title="買える金額の目安" right={formatJPY(purchaseCap)}
          subtitle={budget ? '予算と手元資金から計算' : '手元資金から計算'} />
        {anyShortfall && tab === 'balance' ? (
          <Row title="貯金・積立で調整" subtitle={gaps.join(' · ')} chevron onPress={() => setTab('savings')} />
        ) : null}
      </Group>
      <Segmented<CashTab> value={tab} onChange={setTab}
        options={[{ id: 'balance', label: '残高の内訳' }, { id: 'savings', label: '貯金・積立' }]} />
      {tab === 'balance' ? (
        <>
          <Group>
            <View style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <CashMetric label="現在残高" value={formatJPY(balance)} color={p.text} />
              <CashMetric label="引落・確定" value={formatJPY(due.confirmed)} color={p.text} />
              <CashMetric label="引落・見込み" value={formatJPY(due.estimated)} color={p.text} />
            </View>
          </Group>
          <SectionTitle>銀行口座ごとの残高</SectionTitle>
          <Group>
            {banks.map((account) => {
              const selected = account.id === bank.id;
              const current = balances[account.id] ?? 0;
              const withdrawals = selected ? due : getBankCardWithdrawals(state.accounts, posted, account.id, currentMonth, month);
              const remaining = current - withdrawals.confirmed - withdrawals.estimated - (selected ? amount ?? 0 : 0);
              return <Row key={account.id} title={account.name}
                icon={selected ? { ios: 'checkmark', android: 'check' } : { ios: 'building.columns', android: 'account_balance' }}
                subtitle={`現在 ${formatJPY(current)} · ${selected && amount !== undefined ? '購入・引落後' : '引落後'}`}
                right={formatJPY(remaining)} rightColor={remaining < 0 ? p.danger : selected ? p.tint : p.text} />;
            })}
          </Group>
        </>
      ) : (
        <>
          <Group>
            <View style={{ paddingHorizontal: 16, paddingVertical: 9 }}>
              <Text style={{ color: p.textSecondary, fontSize: 13 }}>この口座からの今月の積立（円）</Text>
              <TextInput accessibilityLabel="この口座からの今月の積立（円）" keyboardType="number-pad"
                value={contributionText ?? (contributionDefault ? String(contributionDefault) : '')} placeholder="0"
                placeholderTextColor={p.textSecondary}
                onChangeText={(value) => setContributionText(value.normalize('NFKC').replace(/[^0-9]/g, '').slice(0, 12))}
                style={{ color: p.text, minHeight: 36, fontSize: 17 }} />
            </View>
            <Row title="貯金の出どころ" right={selectedGoal?.title ?? sourceBank?.name ?? '指定なし'} chevron onPress={chooseSavings} />
            <Row title="手元に残る額" right={formatJPY(result.free)} rightColor={color(result.free)}
              subtitle={selectedGoal ? `積立と貯金 ${formatJPY(savings.available)} を確保後` : '積立を確保後'} />
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
        </>
      )}
      <Text style={{ color: p.textSecondary, fontSize: 12, paddingHorizontal: 4 }}>月末までの引落を反映。今後の入金は試算対象外です。</Text>
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
