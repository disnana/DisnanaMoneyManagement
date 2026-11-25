import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import type { TransactionType } from '@dmm/core/types/finance';
import { getMonthTransactions } from '@dmm/core/utils/metrics';
import { formatMonthLabel } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { accountAvailable } from '@/lib/androidAccount';
import { receiptPreviewEnabled } from '@/lib/receiptDraftFiles';
import { Segmented } from '@/ui/kit';
import { TxGroups } from '@/ui/TxGroups';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { HeaderAction } from '@/ui/HeaderAction';
import { MonthlyCashFlow } from '@/ui/HeroCard';
import { MonthScreen } from '@/ui/MonthScreen';
import { TransactionCalendar } from '@/ui/TransactionCalendar';

type Filter = 'all' | TransactionType;

export default function Transactions() {
  const [calendar, setCalendar] = useState(false);
  return (
    <>
      <Stack.Screen options={{ headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {receiptPreviewEnabled && accountAvailable ? <HeaderAction
            name={{ ios: 'doc.text.viewfinder', android: 'document_scanner' }} label="レシートを読み取る"
            onPress={() => router.push('/receipt-review')} /> : null}
          <HeaderAction name={{ ios: 'magnifyingglass', android: 'search' }} label="取引を検索" onPress={() => router.push('/search')} />
          <HeaderAction name={{ ios: 'list.bullet', android: 'view_list' }} label="一覧表示" selected={!calendar} onPress={() => setCalendar(false)} />
          <HeaderAction name={{ ios: 'calendar', android: 'calendar_month' }} label="カレンダー表示" selected={calendar} onPress={() => setCalendar(true)} />
        </View>
      ) }} />
      <MonthScreen showMonthBar={false}>
        {(month, isPreview) => <TransactionsMonth month={month} calendar={calendar} isPreview={isPreview} />}
      </MonthScreen>
    </>
  );
}

function TransactionsMonth({ month, calendar, isPreview }: { month: string; calendar: boolean; isPreview: boolean }) {
  const { visibleState, transactionFilter, setTransactionFilter } = useFinance();
  const monthTransactions = getMonthTransactions(visibleState.transactions, month);
  const transactions = useMemo(
    () => transactionFilter === 'all' ? monthTransactions : monthTransactions.filter((tx) => tx.type === transactionFilter),
    [monthTransactions, transactionFilter]
  );

  return (
    <>
      <LedgerPicker />
      {!calendar ? <Segmented<Filter>
        prominent
        value={transactionFilter}
        onChange={setTransactionFilter}
        options={[
          { id: 'all', label: 'すべて' },
          { id: 'expense', label: '支出' },
          { id: 'income', label: '収入' },
          { id: 'transfer', label: '振替' },
        ]}
      /> : null}

      <MonthlyCashFlow month={month} showNetSign={false} />
      {calendar
        ? <TransactionCalendar month={month} transactions={monthTransactions} isPreview={isPreview} />
        : <TxGroups dayCards transactions={isPreview ? transactions.slice(0, 18) : transactions}
          empty={`${formatMonthLabel(month)}の該当する取引はありません`} />}
    </>
  );
}
