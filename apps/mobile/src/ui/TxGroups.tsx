import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import type { Transaction } from '@dmm/core/types/finance';
import { groupTransactionsByDate } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { usePalette } from '@/lib/theme';
import { Group } from '@/ui/kit';
import { TxRow } from '@/ui/TxRow';

const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

export function TransactionDayHeading({ date, net }: { date: string; net: number }) {
  const p = usePalette();
  const d = new Date(`${date}T00:00:00`);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
      <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '700' }}>
        {d.getMonth() + 1}月{d.getDate()}日（{weekdays[d.getDay()]}）
      </Text>
      <Text style={{ color: p.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>
        {net >= 0 ? '+' : '-'}{formatJPY(Math.abs(net))}
      </Text>
    </View>
  );
}

/** Transactions grouped by day, each day an inset group. */
export const TxGroups = memo(function TxGroups({ transactions, empty }: { transactions: readonly Transaction[]; empty: string }) {
  const p = usePalette();
  const groups = useMemo(() => groupTransactionsByDate(transactions), [transactions]);
  if (groups.length === 0) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <Text style={{ color: p.textSecondary }}>{empty}</Text>
      </View>
    );
  }
  return (
    <>
      {groups.map((g) => (
        <View key={g.date} style={{ gap: 8 }}>
          <TransactionDayHeading date={g.date} net={g.net} />
          <Group>
            {g.items.map((tx) => <TxRow key={tx.id} tx={tx} />)}
          </Group>
        </View>
      ))}
    </>
  );
});
