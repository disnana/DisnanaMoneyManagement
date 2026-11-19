import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ACCOUNT_TYPE_LABELS } from '@dmm/core/data/categories';
import { computeCreditCardSummary } from '@dmm/core/utils/creditCard';
import { formatJPY, formatMonthLabel, getEffectiveOutflow } from '@dmm/core/utils/format';
import { getAccountLedger } from '@dmm/core/utils/ledgers';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { useCurrentBalances } from '@/lib/currentBalances';
import { ledgerColor, ledgerIcon } from '@/lib/ledgerAppearance';
import { useLedgerPicker } from '@/lib/ledgerPicker';
import { useFinance } from '@/lib/store';
import { useAppearanceStyle } from '@/lib/themePref';
import { usePalette } from '@/lib/theme';
import { AccountSummaryGroup, isPaymentCard } from '@/ui/AccountSummaryRow';
import { HeaderAction } from '@/ui/HeaderAction';
import { CreditPaymentCard } from '@/ui/CreditPaymentCard';
import { IconBadge, MonthBar, Row, SectionTitle } from '@/ui/kit';
import { MonthScreen } from '@/ui/MonthScreen';
import { TxGroups } from '@/ui/TxGroups';

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useFinance();
  const p = usePalette();
  const [appearance] = useAppearanceStyle();
  const balances = useCurrentBalances();
  const account = state.accounts.find((item) => item.id === id);
  const standalone = appearance === 'modern' && account?.type === 'credit';

  return (
    <>
      <Stack.Screen options={{ title: account?.name ?? '口座', headerShown: !standalone }} />
      {standalone ? (
        <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: p.bg, paddingHorizontal: 16, paddingTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <HeaderAction name={{ ios: 'chevron.left', android: 'arrow_back' }} label="口座に戻る" circular inContent
              onPress={() => router.canGoBack() ? router.back() : router.replace('/accounts')} />
            <HeaderAction name={{ ios: 'gearshape', android: 'settings' }} label="カード設定" circular inContent
              onPress={() => router.push({ pathname: '/accounts/card', params: { id } })} />
          </View>
          <Text accessibilityRole="header" style={{ color: p.text, paddingTop: 9, fontSize: 27, fontWeight: '800', letterSpacing: -0.6 }}>
            {account.name}
          </Text>
        </SafeAreaView>
      ) : null}
      <MonthScreen showMonthBar={false} contentInsetAdjustmentBehavior={standalone ? 'never' : 'automatic'}>
        {(month, isPreview) => (
          <AccountMonth id={id} month={month} isPreview={isPreview}
            balance={balances[id] ?? 0} standalone={standalone} />
        )}
      </MonthScreen>
    </>
  );
}

function AccountMonth({ id, month, isPreview, balance, standalone }: { id: string; month: string; isPreview: boolean; balance: number; standalone: boolean }) {
  const p = usePalette();
  const pickLedger = useLedgerPicker();
  const { state, ledgers, updateAccount, setMonth } = useFinance();
  const account = state.accounts.find((item) => item.id === id);
  const list = useMemo(
    () => state.transactions.filter((tx) => (tx.accountId === id || tx.toAccountId === id) && tx.date.startsWith(month)),
    [state.transactions, id, month]
  );
  if (!account) return <Text style={{ color: p.textSecondary }}>口座が見つかりません</Text>;

  const ledger = getAccountLedger(account, ledgers);
  const card = isPaymentCard(account);
  const bank = state.accounts.find((item) => item.id === account.linkedBankAccountId && item.type === 'bank');
  const summary = account.type === 'credit' ? computeCreditCardSummary(account, state.transactions, balance, month) : undefined;
  const displayBalance = account.type === 'debit'
    ? list.reduce((sum, tx) => sum + (tx.type === 'expense' && tx.accountId === id ? getEffectiveOutflow(tx) : 0), 0)
    : balance;
  const label = account.type === 'debit' ? '選択月の利用額' : '現在の残高';

  return (
    <>
      {!summary ? <View style={{ backgroundColor: p.card, borderRadius: p.cardRadius, borderCurve: 'continuous',
        borderWidth: StyleSheet.hairlineWidth, borderColor: p.outline, padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconBadge name={ACCOUNT_ICONS[account.type]} color={account.type === 'credit' ? '#8167BF' : p.tint} size={36} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text accessibilityRole="header" style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{label}</Text>
            <Text style={{ color: p.textSecondary, fontSize: 12 }}>{ACCOUNT_TYPE_LABELS[account.type]}</Text>
          </View>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit
          style={{ color: (card ? displayBalance > 0 : displayBalance < 0) ? p.danger : p.income,
            fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {formatJPY(displayBalance)}
        </Text>
      </View> : null}

      {summary ? (
        <CreditPaymentCard statement={summary} onChangeMonth={setMonth}
          onRecord={() => router.push({
            pathname: '/add',
            params: { accountId: bank?.id, toAccountId: id, billingMonth: month, amount: String(summary.thisMonthRemaining) },
          })} />
      ) : <MonthBar month={month} onChange={setMonth} />}

      <SectionTitle action={standalone ? undefined : '設定'} onAction={() => router.push({ pathname: card ? '/accounts/card' : '/accounts/account', params: { id } })}>
        {card ? 'カード情報' : '口座情報'}
      </SectionTitle>
      <AccountSummaryGroup>
        {summary ? (
          <Row compact title="請求の確定額" subtitle={`${formatMonthLabel(month)}支払分`}
            right={summary.thisMonthConfirmed ? formatJPY(summary.thisMonthGross) : '未入力'} chevron
            onPress={() => router.push({ pathname: '/accounts/billing', params: { id, month } })} />
        ) : null}
        <Row compact title="家計グループ" right={ledger.name} chevron icon={ledgerIcon(ledger)} iconColor={ledgerColor(ledger)}
          onPress={async () => {
            const choice = await pickLedger(ledger.id);
            if (choice) updateAccount(account.id, { ledgerId: choice });
          }} />
        {card ? <Row compact title="引落口座" right={bank?.name ?? '未設定'} /> : null}
        {card ? <Row compact title="このカードで支出を記録" chevron
          onPress={() => router.push({ pathname: '/add', params: { accountId: id } })} /> : null}
      </AccountSummaryGroup>

      <SectionTitle>取引履歴</SectionTitle>
      <TxGroups transactions={isPreview ? list.slice(0, 12) : list} empty="この月の取引はありません" />
    </>
  );
}
