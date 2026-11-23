import { Pressable, Text, View } from 'react-native';
import { usePalette } from '@/lib/theme';

export function SettingsSwitchRow({ title, subtitle, checked, onChange }: {
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (value: boolean) => void | Promise<void>;
}) {
  const p = usePalette();

  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={title} accessibilityHint={subtitle}
      accessibilityState={{ checked }} aria-checked={checked} onPress={() => onChange(!checked)}
      style={({ pressed }) => ({
        minHeight: 56, paddingHorizontal: 16, paddingVertical: 8,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: pressed ? p.fill : 'transparent',
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text style={{ color: p.textSecondary, fontSize: 13 }}>{subtitle}</Text> : null}
      </View>
      <View style={{ width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center',
        alignItems: checked ? 'flex-end' : 'flex-start', backgroundColor: checked ? p.tint : p.fill }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: checked ? p.onTint : p.card }} />
      </View>
    </Pressable>
  );
}
