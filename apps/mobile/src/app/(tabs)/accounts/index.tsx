import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { formatJPY } from '@dmm/core/utils/format';
import { ACCOUNT_TYPE_LABELS } from '@dmm/core/data/categories';
import { moveWithin } from '@dmm/core/utils/order';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { MoveButtons } from '@/ui/MoveButtons';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';

/** Accounts and cards. Total assets live on Home; here the focus is the list itself and its order. */
export default function Accounts() {
  const p = usePalette();
  const { state, visibleState, accountBalances, reorderAccounts } = useFinance();
  const [sorting, setSorting] = useState(false);
  const isCard = (type: string) => type === 'credit' || type === 'debit';
  const cards = visibleState.accounts.filter((a) => isCard(a.type));
  const others = visibleState.accounts.filter((a) => !isCard(a.type));

  /** Move within the section being shown; accounts in other groups / sections keep their slots. */
  const move = (id: string, delta: -1 | 1, section: typeof cards) => {
    const inSection = new Set(section.map((a) => a.id));
    reorderAccounts(moveWithin(state.accounts.map((a) => a.id), id, delta, (x) => inSection.has(x)));
  };

  const rowFor = (a: (typeof cards)[number], index: number, section: typeof cards) => {
    const bal = accountBalances[a.id] ?? 0;
    const row = (
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
    if (!sorting) return <View key={a.id}>{row}</View>;
    return (
      <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>{row}</View>
        <View style={{ paddingRight: 8 }}>
          <MoveButtons label={a.name} canUp={index > 0} canDown={index < section.length - 1}
            onUp={() => move(a.id, -1, section)} onDown={() => move(a.id, 1, section)} />
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <LedgerPicker />
      {others.length > 0 ? (
        <>
          <SectionTitle action={sorting ? '完了' : '並び替え'} onAction={() => setSorting((v) => !v)}>口座</SectionTitle>
          <Group>{others.map((a, i) => rowFor(a, i, others))}</Group>
        </>
      ) : null}
      <SectionTitle action={sorting ? undefined : '追加'} onAction={() => router.push('/accounts/card')}>カード</SectionTitle>
      {cards.length > 0 ? <Group>{cards.map((a, i) => rowFor(a, i, cards))}</Group> : null}
    </Screen>
  );
}
