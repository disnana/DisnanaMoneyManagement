import { useMemo } from 'react';
import { Text } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ACCOUNT_TYPE_LABELS } from '@dmm/core/data/categories';
import { computeCreditCardSummary, getCycleRangeLabel } from '@dmm/core/utils/creditCard';
import { formatDayLabel, formatJPY, formatMonthLabel, getEffectiveOutflow } from '@dmm/core/utils/format';
import { getAccountLedger } from '@dmm/core/utils/ledgers';
import { ledgerColor, ledgerIcon, ledgerOptions } from '@/lib/ledgerAppearance';
import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, Row, SectionTitle } from '@/ui/kit';
import { MonthScreen } from '@/ui/MonthScreen';
import { TxGroups } from '@/ui/TxGroups';

/** One account: current balance and its transactions for the selected month. */
export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useFinance();
  const account = state.accounts.find((a) => a.id === id);
  return (
    <>
      <Stack.Screen options={{ title: account?.name ?? '口座' }} />
      <MonthScreen>{(month, isPreview) => <AccountMonth id={id} month={month} isPreview={isPreview} />}</MonthScreen>
    </>
  );
}

function AccountMonth({ id, month, isPreview }: { id: string; month: string; isPreview: boolean }) {
  const p = usePalette();
  const { state, accountBalances, ledgers, updateAccount } = useFinance();
  const account = state.accounts.find((a) => a.id === id);
  const list = useMemo(
    () => state.transactions.filter((t) => (t.accountId === id || t.toAccountId === id) && t.date.slice(0, 7) === month),
    [state.transactions, id, month]
  );
  const ledger = account ? getAccountLedger(account, ledgers) : undefined;
  const bal = accountBalances[id] ?? 0;
  const isCard = account?.type === 'credit' || account?.type === 'debit';
  const bank = state.accounts.find((a) => a.id === account?.linkedBankAccountId && a.type === 'bank');
  const summary = account?.type === 'credit' ? computeCreditCardSummary(account, state.transactions, bal, month) : undefined;
  const debitSpend = list.reduce((sum, tx) => sum + (tx.type === 'expense' && tx.accountId === id ? getEffectiveOutflow(tx) : 0), 0);
  const displayBalance = summary?.totalUnpaidBalance ?? (account?.type === 'debit' ? debitSpend : bal);
  const negativeBalance = isCard ? displayBalance > 0 : displayBalance < 0;

  return (
    <>
        {!account ? (
          <Text style={{ color: p.textSecondary }}>口座が見つかりません</Text>
        ) : (
          <>
            <Text style={{ color: p.textSecondary, fontSize: 13, textAlign: 'center' }}>
              {summary ? '現在の未払い残高' : account.type === 'debit' ? '選択月の利用額' : '現在の残高'}
            </Text>
            <Text style={{ color: negativeBalance ? p.danger : p.income, fontSize: 34, fontWeight: '800', textAlign: 'center', marginTop: -14, fontVariant: ['tabular-nums'] }}>
              {formatJPY(displayBalance)}
            </Text>
            <Group>
              <Row title="家計グループ" right={ledger?.name} chevron
                icon={ledger ? ledgerIcon(ledger) : undefined} iconColor={ledgerColor(ledger)} onPress={async () => {
                const choice = await pickOne('家計グループ', ledgerOptions(ledgers, ledger?.id));
                if (choice) updateAccount(account.id, { ledgerId: choice });
              }} />
            </Group>
            {!isCard ? (
              <Group>
                <Row title="口座の設定" subtitle="名前・開始残高・削除" chevron
                  onPress={() => router.push({ pathname: '/accounts/account', params: { id } })} />
              </Group>
            ) : null}
            {isCard ? (
              <>
                <SectionTitle action="設定" onAction={() => router.push({ pathname: '/accounts/card', params: { id } })}>
                  {ACCOUNT_TYPE_LABELS[account.type]}
                </SectionTitle>
                <Group>
                  <Row title="引落口座" right={bank?.name ?? '未設定'} />
                  <Row title="このカードで支出を記録" chevron
                    onPress={() => router.push({ pathname: '/add', params: { accountId: id } })} />
                </Group>
              </>
            ) : null}
            {summary ? (
              <Group>
                <Row title={`${formatMonthLabel(month)}の支払残額`}
                  subtitle={`${getCycleRangeLabel(month, account.closingDay, account.paymentMonthOffset)} · ${formatDayLabel(account.paymentDay ?? 27)}払い`}
                  right={formatJPY(summary.thisMonthRemaining)} />
                <Row title={summary.thisMonthConfirmed ? '請求額（確定）' : '請求額（見込み）'} right={formatJPY(summary.thisMonthGross)} />
                <Row title={summary.thisMonthConfirmed ? '確定額を編集' : '確定額を入力'} chevron
                  onPress={() => router.push({ pathname: '/accounts/billing', params: { id, month } })} />
                <Row title="支払い記帳済み" right={formatJPY(summary.thisMonthSettled)} />
                <Row title={`${formatMonthLabel(summary.nextMonthKey)}の支払残額`} right={formatJPY(summary.nextMonthRemaining)} />
                <Row title={`${formatMonthLabel(month)}に使った額`} right={formatJPY(summary.thisMonthUsage)} />
                {summary.creditLimit > 0 ? <Row title="利用可能額" right={formatJPY(summary.availableCredit)} /> : null}
                {summary.thisMonthRemaining > 0 ? (
                  <Row title="選択月分の支払いを記録" chevron onPress={() => router.push({
                    pathname: '/add',
                    params: {
                      accountId: bank?.id,
                      toAccountId: id,
                      billingMonth: month,
                      amount: String(summary.thisMonthRemaining),
                    },
                  })} />
                ) : null}
              </Group>
            ) : null}
          </>
        )}
        <TxGroups transactions={isPreview ? list.slice(0, 12) : list} empty="この月の取引はありません" />
    </>
  );
}
