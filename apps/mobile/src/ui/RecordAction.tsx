import { Pressable, Text } from 'react-native';
import { usePalette } from '@/lib/theme';

export function RecordAction({ label, onPress }: { label: string; onPress: () => void; floating?: boolean }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={{ minHeight: 48, paddingHorizontal: 18, borderRadius: 24, backgroundColor: p.tint,
        alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: p.onTint, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
