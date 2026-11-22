import { useCallback, useMemo } from 'react';
import { Platform, Pressable, SectionList, Text, useWindowDimensions, View } from 'react-native';
import type { Transaction } from '@dmm/core/types/finance';
import { formatJPY, formatMonthLabel, getCurrentMonthKey } from '@dmm/core/utils/format';
import { getMonthTransactions } from '@dmm/core/utils/metrics';
import { tick } from '@/lib/haptics';
import { historySections } from '@/lib/historySections';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { HistorySummary } from './HistorySummary';
import { historyMetrics as m, historyStyles as s } from './historyStyles';
import { TxRow } from './TxRow';

const filters = { all: 'すべて', expense: '支出', income: '収入', transfer: '振替' } as const;
type Filter = keyof typeof filters;
const filterKeys = Object.keys(filters) as Filter[];
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
const transactionKey = (item: Transaction) => item.id;

function HistoryFilters({ value, count, onChange }: { value: Filter; count: number; onChange: (value: Filter) => void }) {
  const p = usePalette();
  return (
    <>
      <View style={s.listTitle}>
        <Text accessibilityRole="header" style={[s.title, { color: p.text }]}>取引明細</Text>
        <Text accessibilityLiveRegion="polite" style={[s.label, { color: p.textSecondary }]}>{count.toLocaleString('ja-JP')}件</Text>
      </View>
      <View style={[s.filters, { borderBottomColor: p.fill }]}>
        {filterKeys.map((key) => {
          const selected = value === key;
          return (
            <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }}
              {...(Platform.OS === 'web' ? { 'aria-pressed': selected } : {})}
              accessibilityLabel={`${filters[key]}の明細`} onPress={() => {
                if (!selected) { tick(); onChange(key); }
              }}
              style={({ pressed }) => [s.filter, { backgroundColor: pressed ? p.fill : 'transparent' }]}>
              <Text style={[s.filterText, { color: selected ? p.tint : p.textSecondary, fontWeight: selected ? '700' : '500' }]}>{filters[key]}</Text>
              {selected ? <View style={[s.selectedLine, { backgroundColor: p.tint }]} /> : null}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function HistoryDay({ date, net, filter }: { date: string; net: number; filter: Filter }) {
  const p = usePalette();
  const day = new Date(date + 'T00:00:00');
  const weekday = weekdays[day.getDay()] + '曜日';
  const subtotal = (net > 0 ? '+' : '') + formatJPY(net);
  const label = filter === 'all' ? '日計' : `${filters[filter]}の収支`;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={`${day.getMonth() + 1}月${day.getDate()}日 ${weekday}、${label} ${subtotal}`}
      style={[s.day, { borderBottomColor: p.fill }]}>
      <Text style={[s.dayTitle, { color: p.text }]}>{day.getDate()}日 <Text style={[s.supporting, { color: p.textSecondary }]}>{weekday}</Text></Text>
      <Text style={[s.supporting, { color: p.textSecondary }]}>{label}  <Text style={[s.dayTotal, { color: p.text }]}>{subtotal}</Text></Text>
    </View>
  );
}

function HistoryEmpty({ month, filter, monthHasEntries }: { month: string; filter: Filter; monthHasEntries: boolean }) {
  const p = usePalette();
  const { activeLedger, setActiveLedgerId, setTransactionFilter, setMonth } = useFinance();
  const current = getCurrentMonthKey();
  const filtered = monthHasEntries && filter !== 'all';
  const monthLabel = formatMonthLabel(month);
  let action;
  if (filtered) action = { label: 'すべての取引を表示', run: () => setTransactionFilter('all') };
  else if (activeLedger) action = { label: '全グループを表示', run: () => setActiveLedgerId(null) };
  else if (current !== month) action = { label: '今月に戻る', run: () => setMonth(current) };

  return (
    <View style={s.empty}>
      <Text style={[s.entryTitle, { color: p.text }]}>
        {monthLabel}の{filtered ? filters[filter] : '取引'}はありません
      </Text>
      {action ? <Pressable accessibilityRole="button" onPress={action.run} style={({ pressed }) => [s.emptyAction, { opacity: pressed ? 0.65 : 1 }]}>
        <Text style={[s.scopeText, { color: p.tint }]}>{action.label}</Text>
      </Pressable> : <Text style={[s.label, { color: p.textSecondary }]}>画面下の＋から取引を記録できます。</Text>}
    </View>
  );
}

function EntrySeparator() {
  const p = usePalette();
  return <View style={[s.rowRule, { backgroundColor: p.fill }]} />;
}

export function TransactionHistoryList({ month, isPreview }: { month: string; isPreview: boolean }) {
  const p = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const { visibleState, transactionFilter, setTransactionFilter } = useFinance();
  const monthEntries = getMonthTransactions(visibleState.transactions, month);
  const transactions = useMemo(() => transactionFilter === 'all' ? monthEntries : monthEntries.filter(tx => tx.type === transactionFilter),
    [monthEntries, transactionFilter]);
  const sections = useMemo(() => historySections(transactions, isPreview ? m.previewRows : Infinity), [transactions, isPreview]);
  const stacked = Math.min(width, m.maxWidth) / fontScale < m.stackedWidth;
  const renderEntry = useCallback(({ item }: { item: Transaction }) => (
    <TxRow tx={item} historyLayout={stacked ? 'stacked' : 'columns'} />
  ), [stacked]);

  return (
    <SectionList sections={sections} keyExtractor={transactionKey} renderItem={renderEntry}
      style={[s.page, { backgroundColor: p.card }]} contentContainerStyle={s.column}
      contentInsetAdjustmentBehavior="automatic" directionalLockEnabled scrollEnabled={!isPreview}
      windowSize={7} stickySectionHeadersEnabled={false} ItemSeparatorComponent={EntrySeparator}
      ListHeaderComponent={<>
        <HistorySummary month={month} />
        <HistoryFilters value={transactionFilter} count={transactions.length} onChange={setTransactionFilter} />
      </>}
      renderSectionHeader={({ section }) => <HistoryDay date={section.date} net={section.net} filter={transactionFilter} />}
      ListEmptyComponent={<HistoryEmpty month={month} filter={transactionFilter} monthHasEntries={monthEntries.length > 0} />}
    />
  );
}
