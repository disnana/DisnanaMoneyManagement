import type { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { formatJPY } from '@dmm/core/utils/format';
import { usePalette } from '@/lib/theme';

export function ModernHero({ children }: { children: ReactNode }) {
  const p = usePalette();
  const accent = p.tint;

  return (
    <View style={{ backgroundColor: p.card, borderRadius: 30, borderCurve: 'continuous', overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth, borderColor: accent + '40' }}>
      <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, { backgroundColor: accent + '10' }]}>
        {[136, 186, 236].map((size) => (
          <View key={size} style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2,
            right: 24 - size / 2, top: 28 - size / 2, backgroundColor: accent + '08',
            borderWidth: 1, borderColor: accent + '20' }} />
        ))}
      </View>
      <View style={{ padding: 18, gap: 12 }}>{children}</View>
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
