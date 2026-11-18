import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { tick } from '@/lib/haptics';

export function AddButton() {
  const p = usePalette();
  return (
    <Pressable
      accessibilityLabel="収支を記録"
      hitSlop={10}
      onPress={() => {
        tick();
        router.push('/add');
      }}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={{ ios: 'plus', android: 'add' }} size={24} tintColor={p.tint} />
    </Pressable>
  );
}
