import { Pressable, View, type PressableProps } from 'react-native';
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
        marginRight: circular ? 8 : 0, // custom (circular) header items sit closer to the screen edge than system ones
        borderRadius: accent ? 22 : 12, backgroundColor: !circular && (selected || pressed) ? p.fill : 'transparent',
      })}>
      {({ pressed }) => circular ? (
        // 36pt circle inside the 44pt hit area: keeps the touch target but leaves air to the screen edge
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
          backgroundColor: pressed ? p.tint : p.fill }}>
          <SymbolView name={name} size={19} tintColor={pressed ? p.onTint : p.tint} />
        </View>
      ) : (
        <SymbolView name={name} size={accent ? 22 : 20} tintColor={selected || accent ? p.tint : p.text} />
      )}
    </Pressable>
  );
}
