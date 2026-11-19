import type { SymbolViewProps } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { TransactionInput } from '@/ui/TransactionForm';
import { KEYBOARD_ACCESSORY_ID } from '@/ui/KeyboardDone';
import { usePalette } from '@/lib/theme';

export function PlanningInput({ label, icon, value, onChange, yen, decimal, unit, optional, placeholder }: {
  label: string;
  icon: SymbolViewProps['name'];
  value: string;
  onChange: (text: string) => void;
  yen?: boolean;
  decimal?: boolean;
  unit?: string;
  optional?: boolean;
  placeholder?: string;
}) {
  return (
    <TransactionInput label={label} icon={icon} value={value} optional={optional} placeholder={placeholder} unit={yen ? '円' : unit}
      keyboardType={yen ? 'number-pad' : decimal ? 'decimal-pad' : 'default'} inputAccessoryViewID={yen || decimal ? KEYBOARD_ACCESSORY_ID : undefined}
      onChangeText={(text) => onChange(yen || decimal
        ? text.normalize('NFKC').replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '').slice(0, decimal ? 18 : 12)
        : text)} />
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
