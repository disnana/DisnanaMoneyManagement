import { Platform, Pressable, View, type PressableProps } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { tick } from '@/lib/haptics';

export function HeaderAction({ name, label, onPress, selected, accent, circular, disabled }: {
  name: SymbolViewProps['name'];
  label: string;
  onPress: NonNullable<PressableProps['onPress']>;
  selected?: boolean;
  accent?: boolean;
  circular?: boolean;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled}
      onPress={(event) => { tick(); onPress(event); }}
      style={({ pressed }) => ({
        width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1,
        // position only (size and colours unchanged): the custom circle fills the whole 44pt bar and touches the
        // status-bar / Dynamic Island band above it, so nudge it down a little on iOS
        transform: circular && Platform.OS === 'ios' ? [{ translateY: 6 }] : undefined,
        borderRadius: accent ? 22 : 12, backgroundColor: !circular && (selected || pressed) ? p.fill : 'transparent',
      })}>
      {({ pressed }) => circular ? (
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
          backgroundColor: pressed ? p.tint : p.fill }}>
          <SymbolView name={name} size={22} tintColor={pressed ? p.onTint : p.tint} />
        </View>
      ) : (
        <SymbolView name={name} size={accent ? 22 : 20} tintColor={selected || accent ? p.tint : p.text} />
      )}
    </Pressable>
  );
}
