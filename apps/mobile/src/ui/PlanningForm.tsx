import { Pressable, Text, TextInput, View } from 'react-native';
import { usePalette } from '@/lib/theme';

export function PlanningInput({ label, value, onChange, yen, decimal }: {
  label: string; value: string; onChange: (text: string) => void; yen?: boolean; decimal?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
      <Text style={{ color: p.textSecondary, fontSize: 12 }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} keyboardType={yen ? 'number-pad' : decimal ? 'decimal-pad' : 'default'}
        onChangeText={(text) => onChange(yen || decimal
          ? text.normalize('NFKC').replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '').slice(0, decimal ? 18 : 12)
          : text)}
        style={{ minHeight: 36, color: p.text, fontSize: 17, paddingVertical: 2 }} />
    </View>
  );
}

export function PlanningActions({ save, close, label = '保存', valid = true }: {
  save: () => void; close: () => void; label?: string; valid?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable accessibilityRole="button" onPress={close}
        style={{ flex: 1, padding: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: p.card }}>
        <Text style={{ color: p.text, fontWeight: '600' }}>キャンセル</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !valid }} disabled={!valid} onPress={save}
        style={({ pressed }) => ({ flex: 1, padding: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center',
          backgroundColor: p.tint, borderRadius: 13, opacity: valid ? pressed ? 0.8 : 1 : 0.45 })}>
        <Text style={{ color: p.onTint, fontWeight: '700' }}>{label}</Text>
      </Pressable>
    </View>
  );
}
