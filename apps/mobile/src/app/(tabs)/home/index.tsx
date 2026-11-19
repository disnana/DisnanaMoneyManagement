import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { computeCreditCardSummary, getPaymentWarning } from '@dmm/core/utils/creditCard';
import { formatMonthLabel, getTodayString } from '@dmm/core/utils/format';
import { useHomeLayout } from '@/lib/homePreferences';
import { useCurrentBalances } from '@/lib/currentBalances';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { useAppearanceStyle } from '@/lib/themePref';
import { AccountSummaryGroup, AccountSummaryRow } from '@/ui/AccountSummaryRow';
import { HomeOverview } from '@/ui/HomeOverview';
import { HomeSection, ModernHomeSections } from '@/ui/ModernHome';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';
import { MonthScreen } from '@/ui/MonthScreen';
import { TxRow } from '@/ui/TxRow';

const BALANCE_PREVIEW_COUNT = 4;

function openAccount(id: string) {
  router.navigate({ pathname: '/accounts/[id]', params: { id } }, { withAnchor: true });
}

export default function Home() {
  const p = usePalette();
  const [appearance] = useAppearanceStyle();
  const flat = appearance === 'modern';
  const { state, visibleState, month } = useFinance();
  const balances = useCurrentBalances();
  const [showAllBalances, setShowAllBalances] = useState(false);
  const assets = visibleState.accounts.reduce((sum, account) => sum + (balances[account.id] ?? 0), 0);
  const accounts = visibleState.accounts.filter((account) =>
    account.type !== 'credit' &&
    (account.type !== 'debit' || !account.linkedBankAccountId || (balances[account.id] ?? 0) !== 0)
  );
  if (flat) {
    return (
      <Screen contentInsetAdjustmentBehavior="never">
        <ModernHomeSections assets={assets} accounts={accounts} balances={balances} onOpen={openAccount} />
        <HomeActivity month={month} balances={balances} flat />
      </Screen>
    );
  }

  const listed = showAllBalances ? accounts : accounts.slice(0, BALANCE_PREVIEW_COUNT);
  const banks = new Map(state.accounts.map((account) => [account.id, account]));

  return (
    <MonthScreen showMonthBar={false}>
      {(month) => (
        <>
          <HomeOverview month={month} assets={assets} />
          <SectionTitle action="口座を見る" onAction={() => router.navigate('/accounts')}>口座別残高</SectionTitle>
          <AccountSummaryGroup>
            {listed.length ? listed.map((account) => (
              <AccountSummaryRow key={account.id} account={account} balance={balances[account.id] ?? 0}
                linkedBank={banks.get(account.linkedBankAccountId ?? '')} onPress={() => openAccount(account.id)} />
            )) : [<Row key="empty" compact title="この家計グループに表示する口座がありません" />]}
            {accounts.length > BALANCE_PREVIEW_COUNT ? (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAllBalances }}
                onPress={() => setShowAllBalances((expanded) => !expanded)}
                style={({ pressed }) => ({
                  minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  paddingHorizontal: 12, backgroundColor: pressed ? p.fill : p.card,
                })}>
                <Text style={{ color: p.tint, fontSize: 13, fontWeight: '600' }}>
                  {showAllBalances ? '口座を折りたたむ' : `残りの${accounts.length - BALANCE_PREVIEW_COUNT}件を表示`}
                </Text>
                <SymbolView name={showAllBalances ? { ios: 'chevron.up', android: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more' }}
                  tintColor={p.tint} size={12} />
              </Pressable>
            ) : null}
          </AccountSummaryGroup>
          <HomeActivity month={month} balances={balances} flat={false} />
        </>
      )}
    </MonthScreen>
  );
}

function HomeActivity({ month, balances, flat }: { month: string; balances: Record<string, number>; flat: boolean }) {
  const { state, visibleState } = useFinance();
  const [layout] = useHomeLayout();
  const recent = visibleState.transactions
    .filter((tx) => tx.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  const cards = visibleState.accounts.filter((account) => account.type === 'credit');
  const divided = flat && layout !== 'month';

  return (
    <>
      {cards.length > 0 ? (
        <HomeSection divided={divided}>
          <SectionTitle>カードの支払い</SectionTitle>
          <AccountSummaryGroup flat={flat}>
            {cards.map((card) => {
              const balance = balances[card.id] ?? 0;
              const statement = computeCreditCardSummary(card, state.transactions, balance, month);
              const warning = getPaymentWarning(statement, getTodayString());
              return <AccountSummaryRow key={card.id} account={card} balance={balance} flat={flat}
                bill={{ label: `${formatMonthLabel(month)}分の残額`, remaining: statement.thisMonthRemaining,
                  warning: warning === null ? undefined : warning === 0 ? '今日が支払日' : `支払日まであと${warning}日` }} onPress={() => openAccount(card.id)} />;
            })}
          </AccountSummaryGroup>
        </HomeSection>
      ) : null}
      <HomeSection divided={divided}>
        <SectionTitle action="すべて見る" onAction={() => router.navigate('/transactions')}>最近の取引</SectionTitle>
        <Group flat={divided}>
          {recent.length > 0 ? recent.map((tx) => <TxRow key={tx.id} tx={tx} showDate />)
            : <Row compact title="この月の取引はまだありません" />}
        </Group>
      </HomeSection>
    </>
  );
}
