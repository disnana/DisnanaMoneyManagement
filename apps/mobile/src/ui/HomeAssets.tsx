import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useHomeAssetVisibility } from '@/lib/homePreferences';
import { tick } from '@/lib/haptics';
import { usePalette } from '@/lib/theme';
import { LedgerPill } from './LedgerPill';
import { featureColors } from './ModernHero';

export const hiddenAssetsLabel = '総資産は非表示';

export function HomeAssetsHeading({ onDark = false }: { onDark?: boolean }) {
  const p = usePalette();
  const [hidden, toggle] = useHomeAssetVisibility();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
        <Text accessibilityRole="header" style={{ color: onDark ? featureColors.secondary : p.text,
          fontSize: 14, fontWeight: '700', flexShrink: 1 }}>現在の総資産</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={hidden ? '総資産を表示' : '総資産を隠す'}
          onPress={() => { tick(); toggle(); }}
          style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
          <SymbolView name={hidden ? { ios: 'eye.slash', android: 'visibility_off' } : { ios: 'eye', android: 'visibility' }}
            tintColor={onDark ? featureColors.secondary : p.textSecondary} size={17} />
        </Pressable>
      </View>
      <LedgerPill onDark={onDark} />
    </View>
  );
}
