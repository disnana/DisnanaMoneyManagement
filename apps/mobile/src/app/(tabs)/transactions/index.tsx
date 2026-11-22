import { type ReactElement, useCallback, useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { getMonthTransactions } from '@dmm/core/utils/metrics';
import { useFinance } from '@/lib/store';
import { HeaderAction } from '@/ui/HeaderAction';
import { HistorySummary } from '@/ui/HistorySummary';
import { historyMetrics as m } from '@/ui/historyStyles';
import { Screen } from '@/ui/kit';
import { MonthPager } from '@/ui/MonthScreen';
import { TransactionCalendar } from '@/ui/TransactionCalendar';
import { TransactionHistoryList } from '@/ui/TransactionHistoryList';

function CalendarMonth({ month, isPreview, summary }: { month: string; isPreview: boolean; summary: ReactElement }) {
  const { visibleState } = useFinance();
  return (
    <Screen directionalLockEnabled scrollEnabled={!isPreview}
      contentContainerStyle={{ paddingBottom: m.bottom, width: '100%', maxWidth: m.maxWidth, alignSelf: 'center' }}>
      {summary}
      <View style={{ paddingHorizontal: m.medium, gap: m.medium }}>
        <TransactionCalendar month={month} transactions={getMonthTransactions(visibleState.transactions, month)} isPreview={isPreview} />
      </View>
    </Screen>
  );
}

export default function Transactions() {
  const [calendar, setCalendar] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const toggleSummary = useCallback(() => setExpanded(open => !open), []);
  return (
    <>
      <Stack.Screen options={{ headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <HeaderAction targetSize={m.touch} name={{ ios: 'magnifyingglass', android: 'search' }}
            label="取引を検索" onPress={() => router.push('/search')} />
          <HeaderAction targetSize={m.touch} name={calendar
            ? { ios: 'list.bullet', android: 'view_list' } : { ios: 'calendar', android: 'calendar_month' }}
            label={calendar ? '一覧表示' : 'カレンダー表示'} onPress={() => setCalendar(!calendar)} />
        </View>
      ) }} />
      <MonthPager>
        {(month, isPreview) => {
          const summary = <HistorySummary month={month} expanded={expanded} onToggle={toggleSummary} />;
          return calendar ? <CalendarMonth month={month} isPreview={isPreview} summary={summary} />
            : <TransactionHistoryList month={month} isPreview={isPreview} summary={summary} />;
        }}
      </MonthPager>
    </>
  );
}
