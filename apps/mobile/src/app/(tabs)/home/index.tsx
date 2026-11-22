import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Modal } from 'react-native';
import { computeCreditCardSummary, getPaymentWarning } from '@dmm/core/utils/creditCard';
import { getMonthTransactions } from '@dmm/core/utils/metrics';
import { formatMonthLabel, getTodayString } from '@dmm/core/utils/format';
import { useCurrentBalances } from '@/lib/currentBalances';
import { useFinance } from '@/lib/store';
import { useHomeAssetVisibility } from '@/lib/homeAssetVisibility';
import { AccountBalanceList } from '@/ui/AccountBalanceList';
import { AccountSummaryGroup, AccountSummaryRow } from '@/ui/AccountSummaryRow';
import { HeroCard, MonthlyCashFlow } from '@/ui/HeroCard';
import { GettingStarted } from '@/ui/GettingStarted';
import { readPreference, savePreference } from '@/lib/preferences';
import { useAppReducedMotion } from '@/lib/motionPref';
import { Group, Row, SectionTitle } from '@/ui/kit';
import { MonthScreen } from '@/ui/MonthScreen';
import { TxRow } from '@/ui/TxRow';

const BALANCE_PREVIEW_COUNT = 4;

function openAccount(id: string) {
  router.navigate({ pathname: '/accounts/[id]', params: { id } }, { withAnchor: true });
}

export default function Home() {
  const [hidden] = useHomeAssetVisibility();
  const [showAllBalances, setShowAllBalances] = useState(false);
  const { state, visibleState } = useFinance();
  const balances = useCurrentBalances();
  const reduceMotion = useAppReducedMotion();
  const [showGuide, setShowGuide] = useState(() =>
    state.transactions.length === 0 && readPreference('dmm_start_guide') !== 'done');
  const hasTransactions = state.transactions.length > 0;
  if (showGuide && hasTransactions) setShowGuide(false);
  useEffect(() => {
    if (hasTransactions && readPreference('dmm_start_guide') !== 'done') {
      savePreference('dmm_start_guide', 'done');
    }
  }, [hasTransactions]);

  function closeGuide() {
    savePreference('dmm_start_guide', 'done');
    setShowGuide(false);
  }

  const assets = visibleState.accounts.reduce((sum, account) => sum + (balances[account.id] ?? 0), 0);
  const accounts = visibleState.accounts.filter((account) =>
    account.type !== 'credit' &&
    (account.type !== 'debit' || !account.linkedBankAccountId || (balances[account.id] ?? 0) !== 0)
  );
  const banks = new Map(state.accounts.map((account) => [account.id, account]));

  if (showGuide) {
    return (
      <Modal visible presentationStyle="fullScreen" animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={closeGuide}>
        <GettingStarted onClose={closeGuide} />
      </Modal>
    );
  }

  return (
    <MonthScreen showMonthBar={false}>
      {(month) => (
        <>
          <HeroCard assets={assets} />
          <SectionTitle action="口座を見る" onAction={() => router.navigate('/accounts')}>口座別残高</SectionTitle>
          <AccountBalanceList accounts={accounts} balances={balances} accountById={banks} onSelect={openAccount}
            preview={{ limit: BALANCE_PREVIEW_COUNT, expanded: showAllBalances, toggle: () => setShowAllBalances(open => !open) }} hidden={hidden} />
          <SectionTitle>月の収支</SectionTitle>
          <MonthlyCashFlow month={month} />
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
          <AccountSummaryGroup>
            {statements.map((statement) => {
              const { card } = statement;
              const warning = getPaymentWarning(statement, today);
              return <AccountSummaryRow key={card.id} account={card} balance={balances[card.id] ?? 0}
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
