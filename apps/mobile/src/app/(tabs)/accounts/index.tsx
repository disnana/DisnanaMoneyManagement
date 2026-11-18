import { router } from 'expo-router';
import { formatJPY } from '@dmm/core/utils/format';
import { ACCOUNT_TYPE_LABELS } from '@dmm/core/data/categories';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { HeroCard } from '@/ui/HeroCard';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { Group, Row, SectionTitle } from '@/ui/kit';
import { MonthScreen } from '@/ui/MonthScreen';

export default function Accounts() {
  const p = usePalette();
  const { visibleState, accountBalances } = useFinance();
  const cards = visibleState.accounts.filter((a) => a.type === 'credit' || a.type === 'debit');
  const others = visibleState.accounts.filter((a) => a.type !== 'credit' && a.type !== 'debit');

  const rowFor = (a: (typeof visibleState.accounts)[number]) => {
    const bal = accountBalances[a.id] ?? 0;
    return (
      <Row
        key={a.id}
        chevron
        onPress={() => router.push({ pathname: '/accounts/[id]', params: { id: a.id } })}
        icon={ACCOUNT_ICONS[a.type]}
        title={a.name}
        subtitle={a.institution ? `${ACCOUNT_TYPE_LABELS[a.type]} · ${a.institution}` : ACCOUNT_TYPE_LABELS[a.type]}
        right={a.type === 'debit' ? undefined : formatJPY(bal)}
        rightColor={bal < 0 ? p.danger : undefined}
      />
    );
  };

  return (
    <MonthScreen>
      {(month) => (
        <>
          <LedgerPicker />
          <HeroCard month={month} />
          {others.length > 0 ? (
            <>
              <SectionTitle>口座</SectionTitle>
              <Group>{others.map(rowFor)}</Group>
            </>
          ) : null}
          <SectionTitle action="追加" onAction={() => router.push('/accounts/card')}>カード</SectionTitle>
          {cards.length > 0 ? <Group>{cards.map(rowFor)}</Group> : null}
        </>
      )}
    </MonthScreen>
  );
}
