import { type ReactElement, useCallback, useMemo } from 'react';
import { Platform, Pressable, SectionList, type SectionListRenderItem, Text, useWindowDimensions, View } from 'react-native';
import type { Transaction } from '@dmm/core/types/finance';
import { formatJPY, formatMonthLabel, getCurrentMonthKey, getTodayString } from '@dmm/core/utils/format';
import { getMonthTransactions } from '@dmm/core/utils/metrics';
import { tick } from '@/lib/haptics';
import { historySections } from '@/lib/historySections';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { historyMetrics as m, historyStyles as s } from './historyStyles';
import { TxRow } from './TxRow';

const filters = { all: 'すべて', expense: '支出', income: '収入', transfer: '振替' } as const;
type Filter = keyof typeof filters;
const filterKeys = Object.keys(filters) as Filter[];
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
const transactionKey = (item: Transaction) => item.id;

function HistoryFilters({ value, count, paired, onChange }: {
  value: Filter; count: number; paired: boolean; onChange: (value: Filter) => void;
}) {
  const p = usePalette();
  return (
    <View style={s.filterRow}>
      <View style={[s.filters, paired && s.pairedFilters, { backgroundColor: p.fill }]}>
        {filterKeys.map((key) => {
          const selected = value === key;
          return (
            <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }}
              {...(Platform.OS === 'web' ? { 'aria-pressed': selected } : {})}
              accessibilityLabel={`${filters[key]}の明細`} onPress={() => {
                if (!selected) { tick(); onChange(key); }
              }}
              style={[s.filter, paired && s.pairedFilter]}>
              {({ pressed }) => (
                <View style={[s.filterFace, { backgroundColor: selected ? p.tint : pressed ? p.sectionHeader : 'transparent' }]}>
                  <Text style={[s.filterText, { color: selected ? p.onTint : p.textSecondary, fontWeight: selected ? '700' : '500' }]}>
                    {filters[key]}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text accessibilityLiveRegion="polite" style={[s.count, { color: p.textSecondary }]}>{count.toLocaleString('ja-JP')}件</Text>
    </View>
  );
}

function HistoryDate({ date, today, inline }: { date: string; today: boolean; inline: boolean }) {
  const p = usePalette();
  const day = new Date(date + 'T00:00:00');
  const weekday = weekdays[day.getDay()];
  const spokenDate = `${day.getMonth() + 1}月${day.getDate()}日 ${weekday}曜日${today ? '、今日' : ''}`;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={spokenDate}
      style={[inline ? s.dateInline : s.dateMark, today && { backgroundColor: p.fill }]}>
      <Text style={[s.dayNumber, { color: today ? p.tint : p.text }]}>{day.getDate()}</Text>
      <Text style={[s.weekday, { color: today ? p.tint : p.textSecondary }]}>{today ? '今日' : weekday + '曜'}</Text>
    </View>
  );
}

function DaySubtotal({ net, filter }: { net: number; filter: Filter }) {
  const p = usePalette();
  const label = filter === 'all' ? '日計' : `${filters[filter]}の収支`;
  const amount = (net > 0 ? '+' : '') + formatJPY(net);
  return (
    <View accessible accessibilityLabel={`${label} ${amount}`} style={[s.dayClose, { borderBottomColor: p.bg }]}>
      <Text style={[s.label, { color: p.textSecondary }]}>{label}</Text>
      <Text style={[s.subtotal, { color: p.textSecondary }]}>{amount}</Text>
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

type HistorySection = ReturnType<typeof historySections>[number];

export function TransactionHistoryList({ month, isPreview, summary }: { month: string; isPreview: boolean; summary: ReactElement }) {
  const p = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const { visibleState, transactionFilter, setTransactionFilter } = useFinance();
  const monthEntries = getMonthTransactions(visibleState.transactions, month);
  const transactions = useMemo(() => transactionFilter === 'all' ? monthEntries : monthEntries.filter(tx => tx.type === transactionFilter),
    [monthEntries, transactionFilter]);
  const sections = useMemo(() => historySections(transactions, isPreview ? m.previewRows : Infinity), [transactions, isPreview]);
  const pageWidth = Math.min(width, m.maxWidth);
  const stacked = pageWidth / fontScale < m.stackedWidth;
  const pairedFilters = (pageWidth - 2 * m.gutter) / fontScale < m.pairedFilterWidth;
  const today = getTodayString();
  const renderEntry = useCallback<SectionListRenderItem<Transaction, HistorySection>>(({ item, index, section }) => {
    const first = index === 0;
    const date = first ? <HistoryDate date={section.date} today={section.date === today} inline={stacked} /> : null;
    return (
      <View style={[s.datedRow, stacked && s.narrowRow, first && s.firstRow]}>
        {stacked ? date : <View style={s.dateRail}>{date}</View>}
        <View style={stacked ? undefined : s.rowContent}><TxRow tx={item} historyLayout={stacked ? 'stacked' : 'columns'} /></View>
      </View>
    );
  }, [stacked, today]);
  const separator = useCallback(() => (
    <View style={[s.rowRule, stacked && s.narrowRule, { backgroundColor: p.fill }]} />
  ), [stacked, p.fill]);

  return (
    <SectionList sections={sections} keyExtractor={transactionKey} renderItem={renderEntry}
      style={[s.page, { backgroundColor: p.card }]} contentContainerStyle={s.column}
      contentInsetAdjustmentBehavior="automatic" directionalLockEnabled scrollEnabled={!isPreview}
      windowSize={7} stickySectionHeadersEnabled={false} ItemSeparatorComponent={separator}
      ListHeaderComponent={<>
        {summary}
        <HistoryFilters value={transactionFilter} count={transactions.length} paired={pairedFilters} onChange={setTransactionFilter} />
      </>}
      renderSectionFooter={({ section }) => <DaySubtotal net={section.net} filter={transactionFilter} />}
      ListEmptyComponent={<HistoryEmpty month={month} filter={transactionFilter} monthHasEntries={monthEntries.length > 0} />}
    />
  );
}
