import type { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatJPY } from '@dmm/core/utils/format';
import { metrics, usePalette } from '@/lib/theme';

export function ModernHero({ children, masthead = false }: { children: ReactNode; masthead?: boolean }) {
  const p = usePalette();
  const accent = p.tint;

  return (
    <View style={[{ backgroundColor: p.card, borderCurve: 'continuous', overflow: 'hidden' }, masthead
      ? { marginTop: -8 - metrics.screenPaddingTop, marginHorizontal: -16, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }
      : { borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: accent + '40' }]}>
      <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, { backgroundColor: accent + '10' }]}>
        {(masthead ? [196, 262, 328] : [136, 186, 236]).map((size) => (
          <View key={size} style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2,
            right: 24 - size / 2, top: (masthead ? 82 : 28) - size / 2, backgroundColor: accent + '08',
            borderWidth: 1, borderColor: accent + '20' }} />
        ))}
      </View>
      {masthead ? (
        <SafeAreaView edges={['top', 'left', 'right']} style={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 22, gap: 14 }}>
          {children}
        </SafeAreaView>
      ) : <View style={{ padding: 18, gap: 12 }}>{children}</View>}
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
