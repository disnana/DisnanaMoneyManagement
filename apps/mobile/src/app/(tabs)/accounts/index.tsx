import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Account } from '@dmm/core/types/finance';
import { computeCreditCardSummary, getPaymentWarning } from '@dmm/core/utils/creditCard';
import { formatJPY, getTodayString } from '@dmm/core/utils/format';
import { useCurrentBalances } from '@/lib/currentBalances';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { LedgerPill } from '@/ui/LedgerPill';
import { ReorderList, SortActions } from '@/ui/ReorderList';
import { AccountSummaryGroup, AccountSummaryRow, isPaymentCard } from '@/ui/AccountSummaryRow';
import { CardHeader, CardSurface } from '@/ui/CardSurface';
import { MonthBar, Row, Screen, SectionTitle } from '@/ui/kit';

type Order = { accounts: string[]; cards: string[] };

export default function Accounts() {
  const p = usePalette();
  const { state, visibleState, reorderAccounts, month, setMonth } = useFinance();
  const balances = useCurrentBalances();
  const [draft, setDraft] = useState<Order>();
  const itemsById = new Map(visibleState.accounts.map((account) => [account.id, account]));
  const accountsById = new Map(state.accounts.map((account) => [account.id, account]));
  const accounts = visibleState.accounts.filter((account) => !isPaymentCard(account));
  const cards = visibleState.accounts.filter(isPaymentCard);
  const accountTotal = accounts.reduce((sum, account) => sum + (balances[account.id] ?? 0), 0);
  const statements = useMemo(() => new Map(visibleState.accounts
    .filter((account) => account.type === 'credit')
    .map((account) => [account.id, computeCreditCardSummary(account, state.transactions, balances[account.id] ?? 0, month)])),
  [visibleState.accounts, state.transactions, balances, month]);
  const billTotal = [...statements.values()].reduce((sum, statement) => sum + statement.thisMonthRemaining, 0);
  const today = getTodayString();
  const addAccount = () => router.push('/accounts/account');
  const addCard = () => router.push('/accounts/card');

  const saveOrder = () => {
    if (!draft) return;
    const accountOrder = draft.accounts.filter((id) => itemsById.has(id));
    const cardOrder = draft.cards.filter((id) => itemsById.has(id));
    if (accountOrder.length === accounts.length && cardOrder.length === cards.length) {
      let nextAccount = 0;
      let nextCard = 0;
      const ids = state.accounts.map((account) => {
        if (!itemsById.has(account.id)) return account.id;
        return isPaymentCard(account) ? cardOrder[nextCard++] : accountOrder[nextAccount++];
      });
      if (ids.some((id, index) => id !== state.accounts[index].id)) reorderAccounts(ids);
    }
    setDraft(undefined);
  };

  const rowFor = (account: Account) => {
    const summary = draft ? undefined : statements.get(account.id);
    const warning = summary ? getPaymentWarning(summary, today, month) : null;
    return (
      <AccountSummaryRow key={account.id} account={account} balance={balances[account.id] ?? 0} sorting={draft !== undefined}
        bill={summary && { label: summary.thisMonthRemaining === 0 && summary.thisMonthGross > 0
          ? '支払い済み' : summary.thisMonthConfirmed ? '支払残額（確定）' : '支払残額（見込み）',
          remaining: summary.thisMonthRemaining,
          warning: warning === null ? undefined : warning === 0 ? '今日が支払日' : `支払日まであと${warning}日` }}
        linkedBank={accountsById.get(account.linkedBankAccountId ?? '')}
        onPress={() => router.push({ pathname: '/accounts/[id]', params: { id: account.id } })} />
    );
  };

  const reorderList = (section: keyof Order, label: string) => draft && draft[section].length > 0 ? (
    <>
      <SectionTitle>{label}</SectionTitle>
      <ReorderList items={draft[section].flatMap((id) => itemsById.get(id) ?? [])}
        renderItem={rowFor} getLabel={(account) => account.name}
        onReorder={(ids) => setDraft((current) => current && { ...current, [section]: ids })} />
    </>
  ) : null;

  const totalRow = (label: string, total: number, color: string) => (
    <View style={{ paddingHorizontal: 14, paddingVertical: 12,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontSize: 14, fontWeight: '700', flexShrink: 1 }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit
        style={{ color, fontSize: 23, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatJPY(total)}</Text>
    </View>
  );

  return (
    <Screen>
      {draft ? (
        <>
          <SortActions title="並べ替え" onCancel={() => setDraft(undefined)} onDone={saveOrder} />
          {reorderList('accounts', '口座')}
          {reorderList('cards', 'カード')}
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
            <LedgerPill />
            {accounts.length > 1 || cards.length > 1 ? (
              <Pressable accessibilityRole="button" onPress={() => {
                tick();
                setDraft({ accounts: accounts.map((account) => account.id), cards: cards.map((account) => account.id) });
              }} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 }}>
                <Text style={{ color: p.tint, fontSize: 15, fontWeight: '600' }}>並べ替え</Text>
              </Pressable>
            ) : null}
          </View>
          <CardSurface style={{ backgroundColor: p.sectionHeader }}>
            {totalRow('口座残高の合計', accountTotal, accountTotal < 0 ? p.danger : p.income)}
          </CardSurface>
          <SectionTitle action={accounts.length ? '口座を追加' : undefined} onAction={addAccount}>口座</SectionTitle>
          <AccountSummaryGroup>
            {accounts.length ? accounts.map(rowFor) : (
              <Row title="口座を追加" subtitle="銀行口座や電子マネーを登録"
                icon={{ ios: 'plus.circle', android: 'add_circle' }} chevron onPress={addAccount} />
            )}
          </AccountSummaryGroup>
          <SectionTitle action={cards.length ? 'カードを追加' : undefined} onAction={addCard}>カード</SectionTitle>
          <AccountSummaryGroup header={statements.size > 0 ? (
            <>
              <CardHeader><MonthBar month={month} onChange={setMonth} /></CardHeader>
              {statements.size > 1 ? (
                <CardHeader style={{ backgroundColor: p.card }}>
                  {totalRow('カード支払残額の合計', billTotal, billTotal > 0 ? p.danger : p.income)}
                </CardHeader>
              ) : null}
            </>
          ) : null}>
            {cards.length ? cards.map(rowFor) : (
              <Row title="カードを追加" subtitle="クレジットカードやデビットカードを登録"
                icon={{ ios: 'plus.circle', android: 'add_circle' }} chevron onPress={addCard} />
            )}
          </AccountSummaryGroup>
        </>
      )}
    </Screen>
  );
}
