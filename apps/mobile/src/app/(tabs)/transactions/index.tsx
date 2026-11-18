import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import type { TransactionType } from '@dmm/core/types/finance';
import { formatJPY, formatMonthLabel } from '@dmm/core/utils/format';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { useFinance } from '@/lib/store';
import { Group, Segmented } from '@/ui/kit';
import { TxGroups } from '@/ui/TxGroups';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { HeaderAction } from '@/ui/HeaderAction';
import { MonthScreen } from '@/ui/MonthScreen';
import { TransactionCalendar } from '@/ui/TransactionCalendar';
import { usePalette } from '@/lib/theme';

type Filter = 'all' | TransactionType;

export default function Transactions() {
  const [calendar, setCalendar] = useState(false);
  return (
    <>
      <Stack.Screen options={{ headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <HeaderAction name={{ ios: 'magnifyingglass', android: 'search' }} label="取引を検索" onPress={() => router.push('/search')} />
          <HeaderAction name={{ ios: 'list.bullet', android: 'view_list' }} label="一覧表示" selected={!calendar} onPress={() => setCalendar(false)} />
          <HeaderAction name={{ ios: 'calendar', android: 'calendar_month' }} label="カレンダー表示" selected={calendar} onPress={() => setCalendar(true)} />
        </View>
      ) }} />
      <MonthScreen>{(month, isPreview) => <TransactionsMonth month={month} calendar={calendar} isPreview={isPreview} />}</MonthScreen>
    </>
  );
}

function TransactionsMonth({ month, calendar, isPreview }: { month: string; calendar: boolean; isPreview: boolean }) {
  const { visibleState, transactionFilter, setTransactionFilter } = useFinance();
  const p = usePalette();
  const totals = computeMonthMetrics(visibleState, month);
  const monthTransactions = useMemo(
    () => visibleState.transactions.filter((tx) => tx.date.startsWith(month)),
    [visibleState.transactions, month]
  );
  const transactions = transactionFilter === 'all' ? monthTransactions : monthTransactions.filter((tx) => tx.type === transactionFilter);

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

      <Group>
        <View style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, gap: 8 }}>
          {[{ label: '収入', value: totals.income, color: p.income },
            { label: '支出', value: totals.expense, color: totals.expense === 0 ? p.income : p.danger },
            { label: '収支', value: totals.net, color: totals.net < 0 ? p.danger : p.income }].map(({ label, value, color }) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Text style={{ color: p.textSecondary, fontSize: 12 }}>{label}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ color, fontSize: 17, fontWeight: '700' }}>{formatJPY(value)}</Text>
            </View>
          ))}
        </View>
      </Group>
      {calendar
        ? <TransactionCalendar month={month} transactions={monthTransactions} isPreview={isPreview} />
        : <TxGroups dayCards transactions={isPreview ? transactions.slice(0, 18) : transactions}
          empty={`${formatMonthLabel(month)}の該当する取引はありません`} />}
    </>
  );
}
