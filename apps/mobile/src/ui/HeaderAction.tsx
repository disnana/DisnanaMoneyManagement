import { Pressable } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { tick } from '@/lib/haptics';

export function HeaderAction({ name, label, onPress, selected, accent }: {
  name: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  selected?: boolean;
  accent?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }}
      onPress={() => { tick(); onPress(); }}
      style={({ pressed }) => ({
        width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
        borderRadius: accent ? 22 : 12, backgroundColor: selected || pressed ? p.fill : 'transparent',
      })}>
      <SymbolView name={name} size={accent ? 22 : 20} tintColor={selected || accent ? p.tint : p.text} />
    </Pressable>
  );
}
