import { Pressable, type PressableProps } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';
import { AppSymbol } from '@/ui/AppSymbol';
import { usePalette } from '@/lib/theme';
import { tick } from '@/lib/haptics';

export function HeaderAction({ name, label, onPress, selected, accent, circular, disabled, targetSize = 44 }: {
  name: SymbolViewProps['name'];
  label: string;
  onPress: NonNullable<PressableProps['onPress']>;
  selected?: boolean;
  accent?: boolean;
  circular?: boolean;
  targetSize?: number;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled}
      onPress={(event) => { tick(); onPress(event); }}
      style={({ pressed }) => ({
        width: targetSize, height: targetSize, alignItems: 'center', justifyContent: 'center',
        borderRadius: circular || accent ? targetSize / 2 : 12,
        backgroundColor: circular && pressed && accent ? p.tint : circular || selected || pressed ? p.fill : 'transparent',
        borderWidth: circular ? 1 : 0, borderColor: p.outline,
        opacity: disabled ? 0.45 : circular && pressed && !accent ? 0.7 : 1,
      })}>
      {({ pressed }) => (
        <AppSymbol name={name} size={accent ? 22 : 20}
          tintColor={circular && pressed && accent ? p.onTint : selected || accent ? p.tint : p.text} />
      )}
    </Pressable>
  );
}
