import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { formatJPY } from '@dmm/core/utils/format';
import { ACCOUNT_TYPE_LABELS } from '@dmm/core/data/categories';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { ReorderList } from '@/ui/ReorderList';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';

/** Accounts and cards. Total assets live on Home; here the focus is the list itself and its order. */
export default function Accounts() {
  const p = usePalette();
  const { state, visibleState, accountBalances, reorderAccounts } = useFinance();
  const [sorting, setSorting] = useState(false);
  const isCard = (type: string) => type === 'credit' || type === 'debit';
  const cards = visibleState.accounts.filter((a) => isCard(a.type));
  const others = visibleState.accounts.filter((a) => !isCard(a.type));

  /** Drop a new order for the section being shown; accounts in other groups / sections keep their slots. */
  const reorder = (section: typeof cards, ids: string[]) => {
    const inSection = new Set(section.map((a) => a.id));
    let next = 0;
    reorderAccounts(state.accounts.map((a) => (inSection.has(a.id) ? ids[next++] : a.id)));
  };

  const rowFor = (a: (typeof cards)[number]) => {
    const bal = accountBalances[a.id] ?? 0;
    return (
      <Row
        chevron={!sorting}
        onPress={sorting ? undefined : () => router.push({ pathname: '/accounts/[id]', params: { id: a.id } })}
        icon={ACCOUNT_ICONS[a.type]}
        title={a.name}
        subtitle={a.institution ? `${ACCOUNT_TYPE_LABELS[a.type]} · ${a.institution}` : ACCOUNT_TYPE_LABELS[a.type]}
        right={sorting || a.type === 'debit' ? undefined : formatJPY(bal)}
        rightColor={bal < 0 ? p.danger : undefined}
      />
    );
  };

  const list = (section: typeof cards) => sorting
    ? <ReorderList items={section} renderItem={rowFor} onReorder={(ids) => reorder(section, ids)} />
    : <Group>{section.map((a) => <View key={a.id}>{rowFor(a)}</View>)}</Group>;

  return (
    <Screen>
      <LedgerPicker />
      {others.length > 0 ? (
        <>
          <SectionTitle action={sorting ? '完了' : '並び替え'} onAction={() => setSorting((v) => !v)}>口座</SectionTitle>
          {list(others)}
        </>
      ) : null}
      <SectionTitle action={sorting ? undefined : '追加'} onAction={() => router.push('/accounts/card')}>カード</SectionTitle>
      {cards.length > 0 ? list(cards) : null}
    </Screen>
  );
}
