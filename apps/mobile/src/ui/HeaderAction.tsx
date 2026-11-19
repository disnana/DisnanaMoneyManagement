import { Pressable, type PressableProps } from 'react-native';
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
        width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
        borderRadius: circular || accent ? 22 : 12,
        backgroundColor: circular && pressed && accent ? p.tint : circular || selected || pressed ? p.fill : 'transparent',
        borderWidth: circular ? 1 : 0, borderColor: p.outline,
        opacity: disabled ? 0.45 : circular && pressed && !accent ? 0.7 : 1,
      })}>
      {({ pressed }) => (
        <SymbolView name={name} size={accent ? 22 : 20}
          tintColor={circular && pressed && accent ? p.onTint : selected || accent ? p.tint : p.text} />
      )}
    </Pressable>
  );
}
