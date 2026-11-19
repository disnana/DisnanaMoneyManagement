import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { metrics, usePalette } from '@/lib/theme';

export function CardSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View style={[{ backgroundColor: p.card, borderRadius: metrics.cardRadius, borderCurve: 'continuous',
      borderWidth: StyleSheet.hairlineWidth, borderColor: p.outline, overflow: 'hidden' }, style]}>
      {children}
    </View>
  );
}

export function CardHeader({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View style={[{ backgroundColor: p.sectionHeader, borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.outline }, style]}>
      {children}
    </View>
  );
}
