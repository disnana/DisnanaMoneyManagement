import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useAppReducedMotion } from '@/lib/motionPref';
import { usePalette } from '@/lib/theme';
import { tick } from '@/lib/haptics';

export function AddButton() {
  const p = usePalette();
  const reduceMotion = useAppReducedMotion();
  return (
    <Pressable
      accessibilityLabel="収支を記録"
      accessibilityRole="button"
      onPress={() => {
        tick();
        router.push('/add');
      }}
      style={({ pressed }) => ({
        width: 54, height: 54, marginHorizontal: 5, borderRadius: 27,
        alignItems: 'center', justifyContent: 'center', backgroundColor: p.tint, opacity: pressed ? 0.8 : 1,
        transform: [{ scale: !reduceMotion && pressed ? 0.94 : 1 }],
      })}>
      <SymbolView name={{ ios: 'plus', android: 'add' }} size={27} tintColor={p.onTint} />
    </Pressable>
  );
}
