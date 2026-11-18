import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { getOrderedCategories } from '@dmm/core/data/categories';
import { kv } from '@/lib/kv';
import { ReorderList } from '@/ui/ReorderList';
import { categoryIcon } from '@/lib/categoryIcons';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { DonutChart } from '@/ui/PieChart';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { Group, IconBadge, SectionTitle, Segmented } from '@/ui/kit';
import { MonthScreen } from '@/ui/MonthScreen';

export default function Analytics() {
  return <MonthScreen>{(month) => <AnalyticsMonth month={month} />}</MonthScreen>;
}

function AnalyticsMonth({ month }: { month: string }) {
  const p = usePalette();
  const { visibleState, state, setCategoryOrder } = useFinance();
  const m = computeMonthMetrics(visibleState, month);
  const [sort, setSortState] = useState<'amount' | 'custom'>(() => (kv.getItem('dmm_analytics_sort') === 'custom' ? 'custom' : 'amount'));
  const setSort = (v: 'amount' | 'custom') => { setSortState(v); kv.setItem('dmm_analytics_sort', v); };

  // "並び順" follows the category order from the settings (and what is changed here); the rest stay by amount
  const fullOrder = getOrderedCategories('expense', state.customCategories, state.categoryOrder?.expense, state.hiddenCategoryIds).map((c) => c.id);
  const rank = (id: string) => { const i = fullOrder.indexOf(id); return i < 0 ? fullOrder.length : i; };
  const rows = sort === 'custom' ? [...m.categoryBreakdown].sort((a, b) => rank(a.categoryId) - rank(b.categoryId)) : m.categoryBreakdown;
  const shown = new Set(rows.map((r) => r.categoryId));
  const reorder = (ids: string[]) => {
    let next = 0;
    setCategoryOrder('expense', fullOrder.map((id) => (shown.has(id) ? ids[next++] : id)));
  };
  const reorderable = sort === 'custom' ? rows.filter((r) => r.categoryId !== 'transfer_fee') : [];

  const categoryRow = (c: (typeof rows)[number]) => (
    <Pressable
      key={c.categoryId}
      onPress={() => router.push({ pathname: '/analytics/category', params: { id: c.categoryId } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: pressed ? p.fill : 'transparent' })}>
      <IconBadge name={categoryIcon(visibleState.customCategories?.find((item) => item.id === c.categoryId)?.icon ?? c.categoryId)} color={c.color} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>{c.name}</Text>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: p.fill, marginTop: 6, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(c.share * 100)}%`, height: 6, backgroundColor: c.color }} />
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
      <LedgerPicker />

      <DonutChart
        slices={m.categoryBreakdown.map((c) => ({ id: c.categoryId, value: c.amount, color: c.color }))}
        centerLabel="支出"
        centerValue={formatJPY(m.expense)}
      />

      <SectionTitle action="予算・計画" onAction={() => router.push('/planning')}>カテゴリ別</SectionTitle>
      {m.categoryBreakdown.length > 1 ? (
        <Segmented<'amount' | 'custom'> value={sort} onChange={setSort} options={[{ id: 'amount', label: '金額順' }, { id: 'custom', label: '並び順' }]} />
      ) : null}
      {sort === 'custom' && m.categoryBreakdown.length > 1 ? (
        <Text style={{ color: p.textSecondary, fontSize: 13, marginTop: -8, paddingHorizontal: 4 }}>右の ≡ を押したまま上下にドラッグして並び替えます。</Text>
      ) : null}
      {m.categoryBreakdown.length === 0 ? (
        <Group>
          <View style={{ padding: 28, alignItems: 'center' }}>
            <Text style={{ color: p.textSecondary }}>支出データがありません</Text>
          </View>
        </Group>
      ) : (
        sort === 'custom' ? (
          <>
            <ReorderList items={reorderable.map((c) => ({ ...c, id: c.categoryId }))} renderItem={(c) => categoryRow(c)} onReorder={reorder} />
            {rows.some((r) => r.categoryId === 'transfer_fee') ? (
              <Group>{rows.filter((r) => r.categoryId === 'transfer_fee').map((c) => categoryRow(c))}</Group>
            ) : null}
          </>
        ) : (
          <Group>{rows.map((c) => categoryRow(c))}</Group>
        )
      )}
    </>
  );
}
