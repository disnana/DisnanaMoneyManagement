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
import { MonthBar, Row, Screen, SectionTitle, Segmented } from '@/ui/kit';

type Section = 'accounts' | 'cards';

export default function Accounts() {
  const p = usePalette();
  const { state, visibleState, reorderAccounts, month, setMonth } = useFinance();
  const balances = useCurrentBalances();
  const [section, setSection] = useState<Section>('accounts');
  const [draft, setDraft] = useState<string[]>();
  const showingCards = section === 'cards';
  const sorting = draft !== undefined;
  const items = visibleState.accounts.filter((account) => isPaymentCard(account) === showingCards);
  const itemsById = new Map(items.map((account) => [account.id, account]));
  const bankById = new Map(state.accounts.map((account) => [account.id, account]));
  const statements = useMemo(() => new Map(visibleState.accounts
    .filter((account) => account.type === 'credit')
    .map((account) => [account.id, computeCreditCardSummary(account, state.transactions, balances[account.id] ?? 0, month)])),
  [visibleState.accounts, state.transactions, balances, month]);
  const showTotal = !showingCards || statements.size > 1;
  const total = showingCards
    ? [...statements.values()].reduce((sum, statement) => sum + statement.thisMonthRemaining, 0)
    : items.reduce((sum, account) => sum + (balances[account.id] ?? 0), 0);
  const today = getTodayString();
  const add = () => router.push(showingCards ? '/accounts/card' : '/accounts/account');

  const saveOrder = () => {
    if (!draft) return;
    const ids = draft.filter((id) => itemsById.has(id));
    if (ids.length === items.length && ids.some((id, index) => id !== items[index].id)) {
      let next = 0;
      reorderAccounts(state.accounts.map((account) => itemsById.has(account.id) ? ids[next++] : account.id));
    }
    setDraft(undefined);
  };

  const rowFor = (account: Account) => {
    const summary = statements.get(account.id);
    const warning = summary && showingCards ? getPaymentWarning(summary, today, month) : null;
    return (
      <AccountSummaryRow key={account.id} account={account} balance={balances[account.id] ?? 0} sorting={sorting}
        bill={summary && { label: summary.thisMonthRemaining === 0 && summary.thisMonthGross > 0
          ? '支払い済み' : summary.thisMonthConfirmed ? '支払残額（確定）' : '支払残額（見込み）',
          remaining: summary.thisMonthRemaining,
          warning: warning === null ? undefined : warning === 0 ? '今日が支払日' : `支払日まであと${warning}日` }}
        linkedBank={bankById.get(account.linkedBankAccountId ?? '')}
        onPress={() => router.push({ pathname: '/accounts/[id]', params: { id: account.id } })} />
    );
  };

  return (
    <Screen>
      {sorting ? (
        <>
          <SortActions title={showingCards ? 'カードを並べ替え' : '口座を並べ替え'}
            onCancel={() => setDraft(undefined)} onDone={saveOrder} />
          <ReorderList items={draft.flatMap((id) => itemsById.get(id) ?? [])}
            renderItem={rowFor} getLabel={(account) => account.name} onReorder={setDraft} />
        </>
      ) : (
        <>
          <Segmented<Section> prominent value={section} onChange={setSection}
            options={[{ id: 'accounts', label: '口座' }, { id: 'cards', label: 'カード' }]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
            <LedgerPill />
            {items.length > 1 ? (
              <Pressable accessibilityRole="button" onPress={() => { tick(); setDraft(items.map((account) => account.id)); }}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
                <Text style={{ color: p.tint, fontSize: 15, fontWeight: '600' }}>並べ替え</Text>
              </Pressable>
            ) : null}
          </View>
          {!showingCards || statements.size > 0 ? (
            <CardSurface>
              {showingCards ? (
                <CardHeader style={showTotal ? undefined : { borderBottomWidth: 0 }}>
                  <MonthBar month={month} onChange={setMonth} />
                </CardHeader>
              ) : null}
              {showTotal ? (
                <View style={{ paddingHorizontal: 14, paddingVertical: 12,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text accessibilityRole="header" style={{ color: p.text, fontSize: 14, fontWeight: '700', flexShrink: 1 }}>
                    {showingCards ? 'カード支払残額の合計' : '口座残高の合計'}
                  </Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit
                    style={{ color: (showingCards ? total > 0 : total < 0) ? p.danger : p.income, fontSize: 23,
                      fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatJPY(total)}</Text>
                </View>
              ) : null}
            </CardSurface>
          ) : null}
          <SectionTitle action={items.length ? (showingCards ? 'カードを追加' : '口座を追加') : undefined}
            onAction={add}>{showingCards ? '登録カード' : '登録口座'}</SectionTitle>
          <AccountSummaryGroup>
            {items.length ? items.map(rowFor) : (
              <Row title={showingCards ? 'カードを追加' : '口座を追加'}
                subtitle={showingCards ? 'クレジットカードやデビットカードを登録' : '銀行口座や電子マネーを登録'}
                icon={{ ios: 'plus.circle', android: 'add_circle' }} chevron onPress={add} />
            )}
          </AccountSummaryGroup>
        </>
      )}
    </Screen>
  );
}
