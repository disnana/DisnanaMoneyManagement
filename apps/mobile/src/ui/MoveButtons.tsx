import { Pressable, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { tick } from '@/lib/haptics';

/** ▲▼ for reordering a list row (reliable inside scroll views, works with a screen reader). */
export function MoveButtons({ onUp, onDown, canUp, canDown, label }: {
  onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean; label: string;
}) {
  const p = usePalette();
  const btn = (name: { ios: string; android: string }, text: string, enabled: boolean, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}を${text}`} disabled={!enabled} hitSlop={4}
      onPress={() => { tick(); onPress(); }}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? p.fill : 'transparent', opacity: enabled ? 1 : 0.25 })}>
      <SymbolView name={name as never} size={16} tintColor={p.tint} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row' }}>
      {btn({ ios: 'chevron.up', android: 'keyboard_arrow_up' }, '上へ', canUp, onUp)}
      {btn({ ios: 'chevron.down', android: 'keyboard_arrow_down' }, '下へ', canDown, onDown)}
    </View>
  );
}
