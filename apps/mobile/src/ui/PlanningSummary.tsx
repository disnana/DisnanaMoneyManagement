import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { usePalette } from '@/lib/theme';
import { CardSurface } from './CardSurface';

export function PlanningSummary({ label, value, color, detail, children }: {
  label: string;
  value: string;
  color?: string;
  detail?: string;
  children?: ReactNode;
}) {
  const p = usePalette();
  return (
    <CardSurface>
      <View style={{ padding: 16, gap: 8 }}>
        <Text accessibilityRole="header" style={{ color: p.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit
          style={{ color: color ?? p.text, fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
        {detail ? <Text style={{ color: p.textSecondary, fontSize: 13 }}>{detail}</Text> : null}
        {children}
      </View>
    </CardSurface>
  );
}

export function PlanningProgress({ amount, total, color, label }: {
  amount: number;
  total: number;
  color: string;
  label: string;
}) {
  const p = usePalette();
  const progress = total > 0 ? Math.max(0, Math.min(100, Math.round(amount / total * 100))) : 0;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: progress }}
      style={{ height: 6, borderRadius: 3, backgroundColor: p.fill, overflow: 'hidden' }}>
      <View style={{ height: 6, width: `${progress}%`, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}
