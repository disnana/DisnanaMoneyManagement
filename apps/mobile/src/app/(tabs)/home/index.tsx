import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Platform, Pressable, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { computeCreditCardSummary, getPaymentWarning } from '@dmm/core/utils/creditCard';
import { getMonthTransactions } from '@dmm/core/utils/metrics';
import { formatMonthLabel, getTodayString } from '@dmm/core/utils/format';
import { useCurrentBalances } from '@/lib/currentBalances';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { AccountSummaryGroup, AccountSummaryRow } from '@/ui/AccountSummaryRow';
import { HeroCard, MonthlyCashFlow } from '@/ui/HeroCard';
import { Group, Row, SectionTitle } from '@/ui/kit';
import { MonthScreen } from '@/ui/MonthScreen';
import { TxRow } from '@/ui/TxRow';

const BALANCE_PREVIEW_COUNT = 4;
const EXPRESSIVE_HOME = Platform.OS === 'android';

function openAccount(id: string) {
  router.navigate({ pathname: '/accounts/[id]', params: { id } }, { withAnchor: true });
}

export default function Home() {
  const p = usePalette();
  const { state, visibleState } = useFinance();
  const balances = useCurrentBalances();
  const [showAllBalances, setShowAllBalances] = useState(false);
  const assets = visibleState.accounts.reduce((sum, account) => sum + (balances[account.id] ?? 0), 0);
  const accounts = visibleState.accounts.filter((account) =>
    account.type !== 'credit' &&
    (account.type !== 'debit' || !account.linkedBankAccountId || (balances[account.id] ?? 0) !== 0)
  );
  const listed = showAllBalances ? accounts : accounts.slice(0, BALANCE_PREVIEW_COUNT);
  const banks = new Map(state.accounts.map((account) => [account.id, account]));

  return (
    <MonthScreen showMonthBar={false}>
      {(month) => (
        <>
          <HeroCard assets={assets} expressive={EXPRESSIVE_HOME} />
          {EXPRESSIVE_HOME ? null : <SectionTitle>月の収支</SectionTitle>}
          <MonthlyCashFlow month={month} expressive={EXPRESSIVE_HOME} />
          <SectionTitle action="口座を見る" onAction={() => router.navigate('/accounts')}>口座別残高</SectionTitle>
          <AccountSummaryGroup flat={EXPRESSIVE_HOME}>
            {listed.length ? listed.map((account) => (
              <AccountSummaryRow key={account.id} account={account} balance={balances[account.id] ?? 0} flat={EXPRESSIVE_HOME}
                linkedBank={banks.get(account.linkedBankAccountId ?? '')} onPress={() => openAccount(account.id)} />
            )) : [<Row key="empty" compact title="この家計グループに表示する口座がありません" />]}
            {accounts.length > BALANCE_PREVIEW_COUNT ? (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAllBalances }}
                onPress={() => setShowAllBalances((expanded) => !expanded)}
                style={({ pressed }) => ({
                  minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  paddingHorizontal: 12, backgroundColor: pressed ? p.fill : EXPRESSIVE_HOME ? 'transparent' : p.card,
                })}>
                <Text style={{ color: p.tint, fontSize: 13, fontWeight: '600' }}>
                  {showAllBalances ? '口座を折りたたむ' : `残りの${accounts.length - BALANCE_PREVIEW_COUNT}件を表示`}
                </Text>
                <SymbolView name={showAllBalances ? { ios: 'chevron.up', android: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more' }}
                  tintColor={p.tint} size={12} />
              </Pressable>
            ) : null}
          </AccountSummaryGroup>
          <HomeActivity month={month} balances={balances} />
        </>
      )}
    </MonthScreen>
  );
}

function HomeActivity({ month, balances }: { month: string; balances: Record<string, number> }) {
  const { state, visibleState } = useFinance();
  const transactions = getMonthTransactions(visibleState.transactions, month);
  const recent = useMemo(() => [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6), [transactions]);
  const statements = useMemo(() => visibleState.accounts
    .filter((account) => account.type === 'credit')
    .map((card) => computeCreditCardSummary(card, state.transactions, balances[card.id] ?? 0, month)),
  [visibleState.accounts, state.transactions, balances, month]);
  const today = getTodayString();

  return (
    <>
      {statements.length > 0 ? (
        <>
          <SectionTitle>カードの支払い</SectionTitle>
          <AccountSummaryGroup flat={EXPRESSIVE_HOME}>
            {statements.map((statement) => {
              const { card } = statement;
              const warning = getPaymentWarning(statement, today);
              return <AccountSummaryRow key={card.id} account={card} balance={balances[card.id] ?? 0} flat={EXPRESSIVE_HOME}
                bill={{ label: `${formatMonthLabel(month)}分の残額`, remaining: statement.thisMonthRemaining,
                  warning: warning === null ? undefined : warning === 0 ? '今日が支払日' : `支払日まであと${warning}日` }} onPress={() => openAccount(card.id)} />;
            })}
          </AccountSummaryGroup>
        </>
      ) : null}
      <SectionTitle action="すべて見る" onAction={() => router.navigate('/transactions')}>最近の取引</SectionTitle>
      <Group>
        {recent.length > 0 ? recent.map((tx) => <TxRow key={tx.id} tx={tx} showDate />)
          : <Row compact title="この月の取引はまだありません" />}
      </Group>
    </>
  );
}
