import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Transaction } from '@dmm/core/types/finance';
import { groupTransactionsByDate } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { metrics, usePalette } from '@/lib/theme';
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
export const TxGroups = memo(function TxGroups({ transactions, empty, dayCards }: { transactions: readonly Transaction[]; empty: string; dayCards?: boolean }) {
  const p = usePalette();
  const groups = useMemo(() => groupTransactionsByDate(transactions), [transactions]);
  const divider = p.outline;
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
        if (dayCards) {
          const d = new Date(`${g.date}T00:00:00`);
          const weekday = weekdays[d.getDay()];
          const total = `${g.net > 0 ? '+' : ''}${formatJPY(g.net)}`;
          return (
            <View key={g.date} style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius, borderCurve: 'continuous',
              borderWidth: StyleSheet.hairlineWidth, borderColor: divider, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                paddingHorizontal: 14, paddingVertical: 9, backgroundColor: p.sectionHeader,
                borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: divider }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text accessibilityRole="header" accessibilityLabel={`${d.getMonth() + 1}月${d.getDate()}日 ${weekday}曜日`}
                    style={{ color: p.text, fontSize: 19, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                    {d.getDate()}<Text style={{ fontSize: 13 }}>日</Text>
                  </Text>
                  <Text accessible={false} aria-hidden style={{ color: p.textSecondary, fontSize: 13 }}>{weekday}曜日</Text>
                </View>
                <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text style={{ color: p.textSecondary, fontSize: 11 }}>日計</Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1, color: g.net < 0 ? p.danger : p.income, fontSize: 14,
                    fontWeight: '600', fontVariant: ['tabular-nums'] }}>{total}</Text>
                </View>
              </View>
              {g.items.map((tx, index) => (
                <View key={tx.id}>
                  {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: 16, backgroundColor: divider }} /> : null}
                  <TxRow tx={tx} showMemo />
                </View>
              ))}
            </View>
          );
        }
        return (
          <View key={g.date} style={{ gap: 8 }}>
            <TransactionDayHeading date={g.date} net={g.net} />
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
});
