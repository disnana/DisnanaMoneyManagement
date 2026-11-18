import { Text, View } from 'react-native';
import type { Transaction } from '@dmm/core/types/finance';
import { groupTransactionsByDate } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { usePalette } from '@/lib/theme';
import { Group } from '@/ui/kit';
import { TxRow } from '@/ui/TxRow';

/** Transactions grouped by day, each day an inset group. */
export function TxGroups({ transactions, empty }: { transactions: Transaction[]; empty: string }) {
  const p = usePalette();
  const groups = groupTransactionsByDate(transactions);
  if (groups.length === 0) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <Text style={{ color: p.textSecondary }}>{empty}</Text>
      </View>
    );
  }
  return (
    <>
      {groups.map((g) => {
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
      })}
    </>
  );
}
