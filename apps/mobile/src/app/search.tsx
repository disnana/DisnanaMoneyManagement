import { useMemo, useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import type { TransactionType } from '@dmm/core/types/finance';
import { formatFullDate, formatMonthLabel, getTodayString, shiftMonth } from '@dmm/core/utils/format';
import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, Row, Screen, Segmented } from '@/ui/kit';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { TxGroups } from '@/ui/TxGroups';
import { CardSurface } from '@/ui/CardSurface';
import { TransactionDatePicker } from '@/ui/TransactionDatePicker';

const PERIODS = [
  { id: 'all', label: '全期間' },
  { id: 'current', label: '今月' },
  { id: 'previous', label: '先月' },
  { id: 'quarter', label: '直近3か月' },
  { id: 'year', label: '今年' },
  { id: 'custom', label: '日付を指定' },
] as const;
type Period = (typeof PERIODS)[number]['id'];
type RangeEnd = 'start' | 'end';

export default function SearchTransactions() {
  const p = usePalette();
  const { visibleState, accountNameMap } = useFinance();
  const today = getTodayString();
  const month = today.slice(0, 7);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | TransactionType>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [range, setRange] = useState({ start: `${month}-01`, end: today });
  const [editingDate, setEditingDate] = useState<RangeEnd>();
  const { start, end } = range;
  const from = period === 'custom' ? start : period === 'year' ? `${month.slice(0, 4)}-01-01`
    : period === 'quarter' ? `${shiftMonth(month, -2)}-01` : '';
  const through = period === 'custom' ? end : period === 'quarter' ? today
    : period === 'year' ? `${month.slice(0, 4)}-12-31` : '';
  const monthFilter = period === 'current' ? month : period === 'previous' ? shiftMonth(month, -1) : '';
  const validRange = period !== 'custom' || start <= end;
  const periodLabel = PERIODS.find(({ id }) => id === period)?.label;
  const normalized = query.trim().normalize('NFKC').toLocaleLowerCase();
  const hasFilters = Boolean(normalized) || type !== 'all' || period !== 'all';
  const results = useMemo(() => {
    if (!hasFilters || !validRange) return [];
    return visibleState.transactions.filter((tx) =>
      (type === 'all' || tx.type === type) &&
      (!monthFilter || tx.date.startsWith(monthFilter)) &&
      (!from || tx.date >= from) && (!through || tx.date <= through) &&
      (!normalized || [
        tx.title, tx.memo, tx.counterparty, tx.accountingSubject, getCategoryById(tx.categoryId, visibleState.customCategories).name,
        accountNameMap[tx.accountId], tx.toAccountId ? accountNameMap[tx.toAccountId] : undefined,
      ].some((value) => value?.normalize('NFKC').toLocaleLowerCase().includes(normalized)))
    );
  }, [visibleState.transactions, visibleState.customCategories, hasFilters, validRange, type, monthFilter, from, through, normalized, accountNameMap]);

  return (
    <>
      <Stack.Screen options={{ title: '取引を検索' }} />
      <Screen keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <CardSurface><Group>
          <TextInput
            accessibilityLabel="検索キーワード"
            placeholder="内容・メモ・カテゴリ・口座"
            placeholderTextColor={p.textSecondary}
            value={query}
            onChangeText={setQuery}
            clearButtonMode="while-editing"
            returnKeyType="search"
            style={{ minHeight: 52, paddingHorizontal: 16, color: p.text, fontSize: 16 }}
          />
          <Row title="期間" right={periodLabel} chevron
            subtitle={monthFilter ? formatMonthLabel(monthFilter) : undefined}
            onPress={async () => {
              const choice = await pickOne('検索する期間', PERIODS.map((option) => ({ ...option, selected: option.id === period })),
                { layout: 'divided' });
              const selected = PERIODS.find(({ id }) => id === choice);
              if (selected) setPeriod(selected.id);
            }} />
          {period === 'custom' ? <Row title="開始日" right={formatFullDate(start)} chevron onPress={() => setEditingDate('start')} /> : null}
          {period === 'custom' ? <Row title="終了日" right={formatFullDate(end)} chevron onPress={() => setEditingDate('end')} /> : null}
        </Group></CardSurface>
        {!validRange ? <Text accessibilityLiveRegion="polite" style={{ color: p.danger }}>終了日は開始日以降を選んでください</Text> : null}
        <LedgerPicker />
        <Segmented value={type} onChange={setType} options={[
          { id: 'all', label: 'すべて' }, { id: 'expense', label: '支出' },
          { id: 'income', label: '収入' }, { id: 'transfer', label: '振替' },
        ]} />
        {validRange ? <TxGroups transactions={results}
          empty={hasFilters ? '条件に一致する取引はありません' : '検索キーワードや絞り込み条件を指定してください'} /> : null}
      </Screen>
      {editingDate ? (
        <TransactionDatePicker title={editingDate === 'start' ? '開始日を選ぶ' : '終了日を選ぶ'} date={range[editingDate]} allowMonthJump
          onCancel={() => setEditingDate(undefined)} onPick={(date) => {
            setRange({ ...range, [editingDate]: date });
            setEditingDate(undefined);
          }} />
      ) : null}
    </>
  );
}
