import { useMemo } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { computeCreditCardSummary } from '@dmm/core/utils/creditCard';
import { computeAccountBalances } from '@dmm/core/store/finance';
import { formatJPY, getTodayString } from '@dmm/core/utils/format';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { HeroCard } from '@/ui/HeroCard';
import { CreditPaymentCard } from '@/ui/CreditPaymentCard';
import { Group, Row, SectionTitle } from '@/ui/kit';
import { MonthScreen } from '@/ui/MonthScreen';
import { TxRow } from '@/ui/TxRow';

export default function Home() {
  const { state, visibleState, accountBalances } = useFinance();
  const today = getTodayString();
  const currentBalances = useMemo(() => {
    const transactions = state.transactions.filter((item) => item.date <= today);
    return transactions.length === state.transactions.length ? accountBalances : computeAccountBalances({ ...state, transactions });
  }, [state, accountBalances, today]);
  const assets = visibleState.accounts.reduce((sum, account) => sum + (currentBalances[account.id] ?? 0), 0);

  return <MonthScreen>{(month) => <HomeMonth month={month} assets={assets} balances={currentBalances} />}</MonthScreen>;
}

function HomeMonth({ month, assets, balances }: { month: string; assets: number; balances: Record<string, number> }) {
  const p = usePalette();
  const { state, visibleState } = useFinance();
  const recent = visibleState.transactions
    .filter((t) => t.date.slice(0, 7) === month)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  const statements = visibleState.accounts
    .filter((account) => account.type === 'credit')
    .map((card) => computeCreditCardSummary(card, state.transactions, balances[card.id] ?? 0, month));

  const accounts = visibleState.accounts.filter((account) => (
    account.type !== 'debit' || !account.linkedBankAccountId || (balances[account.id] ?? 0) !== 0
  ));

  return (
    <>
      <HeroCard month={month} assets={assets} />

      <SectionTitle action="口座を開く" onAction={() => router.navigate('/accounts')}>口座別残高</SectionTitle>
      <Group>
        {accounts.length ? accounts.map((account) => {
          const balance = balances[account.id] ?? 0;
          return (
            <Row key={account.id} compact icon={ACCOUNT_ICONS[account.type]} title={account.name}
              subtitle={account.institution} right={formatJPY(balance)} rightColor={balance < 0 ? p.danger : p.income}
              chevron onPress={() => router.navigate({ pathname: '/accounts/[id]', params: { id: account.id } }, { withAnchor: true })} />
          );
        }) : <Row compact title="この家計グループに口座がありません" />}
      </Group>

      {statements.length > 0 ? (
        <>
          <SectionTitle>カードの支払い</SectionTitle>
          <View style={{ gap: 8 }}>
            {statements.map((statement) => (
              <CreditPaymentCard key={statement.card.id} statement={statement}
                onPress={() => router.navigate({ pathname: '/accounts/[id]', params: { id: statement.card.id } }, { withAnchor: true })} />
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle action="すべて" onAction={() => router.navigate('/transactions')}>主な取引</SectionTitle>
      {recent.length === 0 ? (
        <Group>
          <View style={{ padding: 28, alignItems: 'center' }}>
            <Text style={{ color: p.textSecondary }}>この月の取引はまだありません</Text>
          </View>
        </Group>
      ) : (
        <Group>
          {recent.map((tx) => (
            <TxRow key={tx.id} tx={tx} showDate />
          ))}
        </Group>
      )}
    </>
  );
}
