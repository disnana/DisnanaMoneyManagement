import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { tick } from '@/lib/haptics';

export function SettingsButton() {
  const p = usePalette();
  return (
    <Pressable
      accessibilityLabel="設定"
      hitSlop={10}
      onPress={() => {
        tick();
        router.push('/settings');
      }}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={{ ios: 'gearshape', android: 'settings' }} size={22} tintColor={p.tint} />
    </Pressable>
  );
}
