import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Account } from '@dmm/core/types/finance';
import { computeCreditCardSummary } from '@dmm/core/utils/creditCard';
import { formatJPY, formatMonthLabel } from '@dmm/core/utils/format';
import { useCurrentBalances } from '@/lib/currentBalances';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { metrics, usePalette } from '@/lib/theme';
import { LedgerPill } from '@/ui/LedgerPill';
import { ReorderList, SortActions } from '@/ui/ReorderList';
import { AccountSummaryGroup, AccountSummaryRow, isPaymentCard } from '@/ui/AccountSummaryRow';
import { Row, Screen, SectionTitle } from '@/ui/kit';

export default function Accounts() {
  const p = usePalette();
  const { state, visibleState, reorderAccounts, month } = useFinance();
  const balances = useCurrentBalances();
  const [snapshot, setSnapshot] = useState<string[]>();
  const sorting = snapshot !== undefined;
  const cards = visibleState.accounts.filter(isPaymentCard);
  const accounts = visibleState.accounts.filter((account) => !isPaymentCard(account));
  const total = accounts.reduce((sum, account) => sum + (balances[account.id] ?? 0), 0);
  const bankById = new Map(state.accounts.map((account) => [account.id, account]));

  const reorder = (section: Account[], ids: string[]) => {
    const inSection = new Set(section.map((account) => account.id));
    let next = 0;
    reorderAccounts(state.accounts.map((account) => (inSection.has(account.id) ? ids[next++] : account.id)));
  };

  const rowFor = (account: Account) => {
    const balance = balances[account.id] ?? 0;
    const summary = !sorting && account.type === 'credit'
      ? computeCreditCardSummary(account, state.transactions, balance, month)
      : undefined;
    return (
      <AccountSummaryRow key={account.id} account={account} balance={balance} sorting={sorting}
        bill={summary && { label: `${formatMonthLabel(month)}分の残額`, remaining: summary.thisMonthRemaining }}
        linkedBank={bankById.get(account.linkedBankAccountId ?? '')}
        onPress={() => router.push({ pathname: '/accounts/[id]', params: { id: account.id } })} />
    );
  };

  const list = (section: Account[], empty: string) => sorting
    ? <ReorderList items={section} renderItem={rowFor} getLabel={(account) => account.name}
        onReorder={(ids) => reorder(section, ids)} />
    : <AccountSummaryGroup>
        {section.length ? section.map(rowFor) : [<Row key="empty" compact title={empty} />]}
      </AccountSummaryGroup>;

  return (
    <Screen>
      {sorting && snapshot ? (
        <SortActions title="口座" onCancel={() => { reorderAccounts(snapshot); setSnapshot(undefined); }}
          onDone={() => setSnapshot(undefined)} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
          <LedgerPill />
          {accounts.length > 1 || cards.length > 1 ? (
            <Pressable accessibilityRole="button" onPress={() => { tick(); setSnapshot(state.accounts.map((account) => account.id)); }}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
              <Text style={{ color: p.tint, fontSize: 15, fontWeight: '600' }}>並び替え</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      {!sorting ? (
        <View style={{ backgroundColor: p.sectionHeader, borderRadius: metrics.cardRadius, borderCurve: 'continuous',
          borderWidth: StyleSheet.hairlineWidth, borderColor: p.outline, paddingHorizontal: 14, paddingVertical: 12,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: p.text, fontSize: 14, fontWeight: '700', flexShrink: 1 }}>口座残高の合計</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit
            style={{ color: total < 0 ? p.danger : p.income, fontSize: 23, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {formatJPY(total)}
          </Text>
        </View>
      ) : null}
      <SectionTitle action={sorting ? undefined : '口座を追加'} onAction={() => router.push('/accounts/account')}>口座</SectionTitle>
      {list(accounts, 'この家計グループに口座がありません')}
      <SectionTitle action={sorting ? undefined : 'カードを追加'} onAction={() => router.push('/accounts/card')}>カード</SectionTitle>
      {list(cards, 'この家計グループにカードがありません')}
    </Screen>
  );
}
