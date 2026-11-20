import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Transaction } from '@dmm/core/types/finance';
import { formatFullDate, getTodayString } from '@dmm/core/utils/format';
import { indexTransactionsByDate } from '@dmm/core/utils/metrics';
import { tick } from '@/lib/haptics';
import { usePalette } from '@/lib/theme';
import { SectionTitle } from './kit';
import { TxGroups } from './TxGroups';

const WEEK = ['月', '火', '水', '木', '金', '土', '日'];
const COLUMN_WIDTH = '14.285714%';
const yen = new Intl.NumberFormat('ja-JP');

export function TransactionCalendar({ month, transactions, isPreview }: { month: string; transactions: readonly Transaction[]; isPreview: boolean }) {
  const p = usePalette();
  const today = getTodayString();
  const [picked, setPicked] = useState(today);
  const selected = picked.startsWith(month) ? picked : today.startsWith(month) ? today : `${month}-01`;
  const [year, m] = month.split('-').map(Number);
  const start = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, m, 0).getDate();
  const byDate = useMemo(() => indexTransactionsByDate(transactions), [transactions]);
  const numWeeks = Math.ceil((start + days) / 7);
  const line = p.separator === 'transparent' ? p.fill : p.separator;
  const weekdayColor = (index: number) => index === 6 ? p.danger : index === 5 ? p.tint : p.textSecondary;
  const rule = StyleSheet.hairlineWidth;

  return (
    <>
      <View style={{ backgroundColor: p.card, borderColor: line, borderWidth: rule, borderRadius: 12, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: p.fill }}>
          {WEEK.map((day, index) => (
            <Text key={day} style={{ width: COLUMN_WIDTH, paddingVertical: 8, textAlign: 'center', fontSize: 13,
              fontWeight: '700', color: weekdayColor(index) }}>{day}</Text>
          ))}
        </View>
        {Array.from({ length: numWeeks }, (_, week) => (
          <View key={week} style={{ flexDirection: 'row' }}>
            {WEEK.map((day, col) => {
              const n = week * 7 + col - start + 1;
              const cell = {
                width: COLUMN_WIDTH, minHeight: 66, borderTopWidth: rule, borderRightWidth: col === 6 ? 0 : rule,
                borderColor: line,
              };
              if (n < 1 || n > days) return <View key={day} style={{ ...cell, backgroundColor: p.bg }} />;
              const date = `${month}-${String(n).padStart(2, '0')}`;
              const summary = byDate.get(date);
              const active = date === selected;
              const amountLines = summary ? [
                { key: 'income', amount: summary.income, color: p.income, prefix: '+' },
                { key: 'expense', amount: summary.expense, color: p.danger, prefix: '−' },
                { key: 'transfer', amount: summary.transfer, color: p.textSecondary, prefix: '' },
              ].filter(({ amount }) => amount > 0) : [];
              return (
                <Pressable key={date} accessibilityRole="button" accessibilityState={{ selected: active }}
                  accessibilityLabel={`${formatFullDate(date)} ${summary?.items.length ?? 0}件`}
                  onPress={() => { tick(); setPicked(date); }}
                  style={({ pressed }) => ({
                    ...cell, paddingHorizontal: 3, paddingVertical: 3, justifyContent: 'space-between',
                    backgroundColor: pressed ? p.fill : p.card,
                  })}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: active ? p.tint : 'transparent' }}>
                    <Text style={{ color: active ? p.onTint : date === today ? p.tint : col >= 5 ? weekdayColor(col) : p.text,
                      fontSize: 13, fontWeight: date === today || active ? '800' : '600' }}>{n}</Text>
                  </View>
                  <View>
                    {amountLines.map(({ key, amount, color, prefix }) => (
                      <Text key={key} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
                        style={{ color, textAlign: 'right', fontSize: 11, lineHeight: 13, fontVariant: ['tabular-nums'] }}>
                        {prefix}{yen.format(amount)}
                      </Text>
                    ))}
                    {summary && amountLines.length === 0 ? (
                      <Text style={{ color: p.textSecondary, textAlign: 'right', fontSize: 11 }}>{summary.items.length}件</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <SectionTitle>{formatFullDate(selected)}</SectionTitle>
      {isPreview ? null : <TxGroups transactions={byDate.get(selected)?.items ?? []} empty="この日の取引はありません" />}
    </>
  );
}
