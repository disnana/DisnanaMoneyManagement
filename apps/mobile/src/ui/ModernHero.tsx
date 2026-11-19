import type { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { formatJPY } from '@dmm/core/utils/format';
import { usePalette } from '@/lib/theme';

export const featureColors = {
  surface: '#192B42',
  text: '#F5F8FF',
  secondary: '#B9CADF',
  positive: '#B6D9FF',
  negative: '#FFAAA6',
  control: '#FFFFFF18',
  pressed: '#FFFFFF32',
};

export function ModernFeature({ children }: { children: ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: featureColors.surface, borderRadius: 28, borderCurve: 'continuous',
      borderWidth: StyleSheet.hairlineWidth, borderColor: '#7AB0E65C', overflow: 'hidden' }}>
      <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, { backgroundColor: p.tint + '10' }]}>
        <View style={{ position: 'absolute', width: 290, height: 290, borderRadius: 145,
          top: -171, right: -105, backgroundColor: '#70B6FF12', borderWidth: 1, borderColor: '#8EC4FF33' }} />
        <View style={{ position: 'absolute', width: 238, height: 238, borderRadius: 119,
          top: -157, right: -99, backgroundColor: '#70B6FF13' }} />
      </View>
      <View style={{ paddingHorizontal: 18, paddingVertical: 16, gap: 7 }}>{children}</View>
    </View>
  );
}

export function ModernHeroAmount({ amount, color }: { amount: number; color: string }) {
  const { width, fontScale } = useWindowDimensions();
  const formatted = formatJPY(amount);
  // Account for screen gutters and hero padding before scaling long monetary values.
  const availableWidth = width - 72;
  const fontSize = Math.min(45, Math.floor(availableWidth / (formatted.length * 0.66 * fontScale)));

  return (
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}
      style={{ color, fontSize, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}>
      {formatted}
    </Text>
  );
}
