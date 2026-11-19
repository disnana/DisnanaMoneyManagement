import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFinance } from '@/lib/store';
import { metrics, usePalette } from '@/lib/theme';
import { MonthBar } from './kit';

export function AnalyticsMonthCard({ month, children }: { month: string; children: ReactNode }) {
  const p = usePalette();
  const { setMonth } = useFinance();

  return (
    <View style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius, borderCurve: 'continuous',
      borderWidth: StyleSheet.hairlineWidth, borderColor: p.outline, overflow: 'hidden' }}>
      <View style={{ backgroundColor: p.sectionHeader, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.outline }}>
        <MonthBar month={month} onChange={setMonth} />
      </View>
      <View style={{ padding: 14 }}>{children}</View>
    </View>
  );
}
