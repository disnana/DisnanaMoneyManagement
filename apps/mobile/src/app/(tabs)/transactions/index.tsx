import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { groupTransactionsByDate } from '@dmm/core/utils/metrics';
import { formatJPY, formatMonthLabel } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, MonthBar, Screen, Segmented } from '@/ui/kit';
import { TxRow } from '@/ui/TxRow';

type Filter = 'all' | 'expense' | 'income' | 'transfer';

export default function Transactions() {
  const p = usePalette();
  const { state, month, setMonth } = useFinance();
  const [filter, setFilter] = useState<Filter>('all');

  const groups = useMemo(() => {
    const list = state.transactions.filter(
      (t) => t.date.slice(0, 7) === month && (filter === 'all' || t.type === filter)
    );
    return groupTransactionsByDate(list);
  }, [state.transactions, month, filter]);

  return (
    <Screen>
      <MonthBar month={month} onChange={setMonth} />
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: 'すべて' },
          { id: 'expense', label: '支出' },
          { id: 'income', label: '収入' },
          { id: 'transfer', label: '振替' },
        ]}
      />

      {groups.length === 0 ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Text style={{ color: p.textSecondary }}>{formatMonthLabel(month)}の取引はありません</Text>
        </View>
      ) : (
        groups.map((g) => {
          const d = new Date(`${g.date}T00:00:00`);
          const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
          return (
            <View key={g.date} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '700' }}>
                  {d.getMonth() + 1}月{d.getDate()}日（{weekday}）
                </Text>
                <Text style={{ color: p.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                  {g.net >= 0 ? '+' : '-'}
                  {formatJPY(Math.abs(g.net))}
                </Text>
              </View>
              <Group>
                {g.items.map((tx) => (
                  <TxRow key={tx.id} tx={tx} />
                ))}
              </Group>
            </View>
          );
        })
      )}
    </Screen>
  );
}
