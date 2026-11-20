import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { getOrderedCategories } from '@dmm/core/data/categories';
import { kv } from '@/lib/kv';
import { ReorderList, SortActions } from '@/ui/ReorderList';
import { categoryIcon } from '@/lib/categoryIcons';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { AnalyticsMonthCard } from '@/ui/AnalyticsMonthCard';
import { DonutChart } from '@/ui/PieChart';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { Group, IconBadge, SectionTitle, Segmented } from '@/ui/kit';
import { MonthScreen } from '@/ui/MonthScreen';
import { MonthlyTrend } from '@/ui/MonthlyTrend';

type Sort = 'amount' | 'custom';
type Kind = 'income' | 'expense';
type Mode = `${Kind}-breakdown` | `${Kind}-trend`;

const MODES: { id: Mode; label: string }[] = [
  { id: 'expense-breakdown', label: '支出内訳' },
  { id: 'income-breakdown', label: '収入内訳' },
  { id: 'expense-trend', label: '支出推移' },
  { id: 'income-trend', label: '収入推移' },
];

export default function Analytics() {
  const [mode, setMode] = useState<Mode>('expense-breakdown');
  const kind = mode.startsWith('expense') ? 'expense' : 'income';
  const [sort, setSort] = useState<Sort>(() => kv.getItem('dmm_analytics_sort') === 'custom' ? 'custom' : 'amount');
  const changeSort = (value: Sort) => {
    setSort(value);
    kv.setItem('dmm_analytics_sort', value);
  };
  return (
    <MonthScreen showMonthBar={false}>{(month, isPreview) => (
      <>
        <LedgerPicker />
        <Segmented value={mode} onChange={setMode} options={MODES} />
        {mode.endsWith('-trend') ? <MonthlyTrend month={month} kind={kind} /> : (
          <AnalyticsMonth key={kind} kind={kind} month={month} isPreview={isPreview} sort={sort} onSortChange={changeSort} />
        )}
      </>
    )}</MonthScreen>
  );
}

function AnalyticsMonth({ kind, month, isPreview, sort, onSortChange }: {
  kind: Kind;
  month: string;
  isPreview: boolean;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
}) {
  const p = usePalette();
  const { visibleState, state, setCategoryOrder } = useFinance();
  const m = useMemo(() => computeMonthMetrics(visibleState, month), [visibleState, month]);
  const breakdown = kind === 'income' ? m.incomeCategoryBreakdown : m.categoryBreakdown;
  const label = kind === 'income' ? '収入' : '支出';
  const [before, setBefore] = useState<string[]>(); // category order before the first drag in this session

  // "並び順" follows the category order from the settings (and what is changed here); the rest stay by amount
  const fullOrder = getOrderedCategories(kind, state.customCategories, state.categoryOrder?.[kind], state.hiddenCategoryIds).map((c) => c.id);
  const rank = (id: string) => { const i = fullOrder.indexOf(id); return i < 0 ? fullOrder.length : i; };
  const rows = sort === 'custom' ? [...breakdown].sort((a, b) => rank(a.categoryId) - rank(b.categoryId)) : breakdown;
  const reorderable = rows.filter((r) => r.categoryId !== 'transfer_fee' && rank(r.categoryId) < fullOrder.length);
  const canReorder = sort === 'custom' && !isPreview && reorderable.length > 1;
  const shown = new Set(reorderable.map((r) => r.categoryId));
  const reorder = (ids: string[]) => {
    let next = 0;
    if (!before) setBefore(fullOrder);
    setCategoryOrder(kind, fullOrder.map((id) => (shown.has(id) ? ids[next++] : id)));
  };
  const fixed = rows.filter((r) => !shown.has(r.categoryId));

  const categoryRow = (c: (typeof rows)[number], sorting = false) => (
    <Pressable
      key={c.categoryId}
      onPress={() => router.push({ pathname: '/analytics/category', params: { id: c.categoryId } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: sorting ? 8 : 12, paddingLeft: sorting ? 0 : 14, paddingRight: 14, backgroundColor: pressed ? p.fill : 'transparent' })}>
      <IconBadge name={categoryIcon(visibleState.customCategories?.find((item) => item.id === c.categoryId)?.icon ?? c.categoryId)} color={c.color} size={sorting ? 34 : 40} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>{c.name}</Text>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: p.fill, marginTop: 6, overflow: 'hidden' }}>
          <View style={{ width: `${Math.max(0, Math.min(100, Math.round(c.share * 100)))}%`, height: 6, backgroundColor: c.color }} />
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatJPY(c.amount)}</Text>
        <Text style={{ color: p.textSecondary, fontSize: 12 }}>{Math.round(c.share * 100)}%</Text>
      </View>
    </Pressable>
  );

  return (
    <>
      <AnalyticsMonthCard month={month}>
        <DonutChart
          slices={breakdown.filter((c) => c.amount > 0).map((c) => ({ id: c.categoryId, value: c.amount, color: c.color }))}
          centerLabel={label}
          centerValue={formatJPY(m[kind])}
        />
      </AnalyticsMonthCard>

      <SectionTitle action="予算・計画" onAction={() => router.push('/planning')}>カテゴリ別</SectionTitle>
      {breakdown.length > 1 ? (
        <Segmented<Sort> value={sort} onChange={(value) => { setBefore(undefined); onSortChange(value); }} options={[{ id: 'amount', label: '金額順' }, { id: 'custom', label: '並び順' }]} />
      ) : null}
      {canReorder ? (
        before
          ? <SortActions title="並べ替え中" cancelLabel="元に戻す" onCancel={() => { setCategoryOrder(kind, before); setBefore(undefined); }} onDone={() => setBefore(undefined)} />
          : <Text style={{ color: p.textSecondary, fontSize: 13, marginTop: -8, paddingHorizontal: 4 }}>行を長押しして並べ替え</Text>
      ) : null}
      {breakdown.length === 0 ? (
        <Group>
          <View style={{ padding: 28, alignItems: 'center' }}>
            <Text style={{ color: p.textSecondary }}>{label}データがありません</Text>
          </View>
        </Group>
      ) : (
        canReorder ? (
          <>
            <ReorderList items={reorderable.map((c) => ({ ...c, id: c.categoryId }))} renderItem={(c) => categoryRow(c, true)} getLabel={(c) => c.name} onReorder={reorder} />
            {fixed.length > 0 ? <Group>{fixed.map((c) => categoryRow(c))}</Group> : null}
          </>
        ) : (
          <Group>{rows.map((c) => categoryRow(c))}</Group>
        )
      )}
    </>
  );
}
