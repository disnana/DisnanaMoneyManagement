import { SymbolViewProps } from 'expo-symbols';
import { formatJPY } from '@dmm/core/utils/format';
import { ACCOUNT_TYPE_LABELS } from '@dmm/core/data/categories';
import type { AccountType } from '@dmm/core/types/finance';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';

const ICONS: Record<AccountType, SymbolViewProps['name']> = {
  bank: { ios: 'building.columns.fill', android: 'account_balance' },
  psp: { ios: 'arrow.triangle.2.circlepath', android: 'sync_alt' },
  foreign_bank: { ios: 'globe', android: 'language' },
  credit: { ios: 'creditcard.fill', android: 'credit_card' },
  debit: { ios: 'creditcard', android: 'credit_card' },
  cash: { ios: 'wallet.pass.fill', android: 'wallet' },
  emoney: { ios: 'iphone', android: 'smartphone' },
  investment: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up' },
};

export default function Accounts() {
  const p = usePalette();
  const { state, accountBalances, totalAssets } = useFinance();
  const cards = state.accounts.filter((a) => a.type === 'credit' || a.type === 'debit');
  const others = state.accounts.filter((a) => a.type !== 'credit' && a.type !== 'debit');

  const rowFor = (a: (typeof state.accounts)[number]) => {
    const bal = accountBalances[a.id] ?? 0;
    return (
      <Row
        key={a.id}
        icon={ICONS[a.type]}
        title={a.name}
        subtitle={a.institution || ACCOUNT_TYPE_LABELS[a.type]}
        right={a.type === 'debit' ? undefined : formatJPY(bal)}
        rightColor={bal < 0 ? p.danger : undefined}
      />
    );
  };

  return (
    <Screen>
      <Group>
        <Row title="正味総資産" right={formatJPY(totalAssets)} />
      </Group>
      {others.length > 0 ? (
        <>
          <SectionTitle>口座</SectionTitle>
          <Group>{others.map(rowFor)}</Group>
        </>
      ) : null}
      {cards.length > 0 ? (
        <>
          <SectionTitle>カード</SectionTitle>
          <Group>{cards.map(rowFor)}</Group>
        </>
      ) : null}
    </Screen>
  );
}
