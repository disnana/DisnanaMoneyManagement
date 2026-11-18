import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { computeCreditCardSummary } from '@dmm/core/utils/creditCard';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { HeroCard } from '@/ui/HeroCard';
import { CreditPaymentCard } from '@/ui/CreditPaymentCard';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { Group, SectionTitle } from '@/ui/kit';
import { MonthScreen } from '@/ui/MonthScreen';
import { TxRow } from '@/ui/TxRow';

export default function Home() {
  return <MonthScreen>{(month) => <HomeMonth month={month} />}</MonthScreen>;
}

function HomeMonth({ month }: { month: string }) {
  const p = usePalette();
  const { state, visibleState, accountBalances } = useFinance();
  const recent = visibleState.transactions
    .filter((t) => t.date.slice(0, 7) === month)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  const statements = visibleState.accounts
    .filter((account) => account.type === 'credit')
    .map((card) => computeCreditCardSummary(card, state.transactions, accountBalances[card.id] ?? 0, month));

  return (
    <>
      <LedgerPicker />
      <HeroCard month={month} />

      {statements.length > 0 ? (
        <>
          <SectionTitle>カードの支払い</SectionTitle>
          <View style={{ gap: 10 }}>
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
