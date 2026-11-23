import { Pressable, Text, useColorScheme, View } from 'react-native';
import { usePalette } from '@/lib/theme';

export function SettingsSwitchRow({ title, subtitle, checked, onChange }: {
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (value: boolean) => void | Promise<void>;
}) {
  const p = usePalette();
  const isDark = useColorScheme() === 'dark';
  const showOffOutline = isDark && !checked;

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
      <View style={{
        width: 48, height: 28, borderRadius: 14, padding: showOffOutline ? 2 : 3, justifyContent: 'center',
        alignItems: checked ? 'flex-end' : 'flex-start', backgroundColor: checked ? p.tint : p.fill,
        borderWidth: showOffOutline ? 1 : 0, borderColor: p.outline,
      }}>
        <View style={{
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: checked ? p.onTint : showOffOutline ? p.textSecondary : p.card,
        }} />
      </View>
    </Pressable>
  );
}
