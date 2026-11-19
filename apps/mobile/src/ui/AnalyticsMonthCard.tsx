import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useFinance } from '@/lib/store';
import { MonthBar } from './kit';
import { CardHeader, CardSurface } from './CardSurface';

export function AnalyticsMonthCard({ month, children }: { month: string; children: ReactNode }) {
  const { setMonth } = useFinance();

  return (
    <CardSurface>
      <CardHeader>
        <MonthBar month={month} onChange={setMonth} />
      </CardHeader>
      <View style={{ padding: 14 }}>{children}</View>
    </CardSurface>
  );
}
