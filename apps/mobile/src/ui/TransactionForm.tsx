import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { metrics, usePalette } from '@/lib/theme';

export function TransactionInput({ label, icon, optional, unit, ...props }: TextInputProps & {
  label: string;
  icon: SymbolViewProps['name'];
  optional?: boolean;
  unit?: string;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 5,
      minHeight: metrics.rowMinHeight - 8 }}>
      <View style={{ width: 22, alignItems: 'center' }}>
        <SymbolView name={icon} size={16} tintColor={p.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.textSecondary, fontSize: 12 }}>
          {label}{optional ? '（任意）' : ''}
        </Text>
        <TextInput {...props} accessibilityLabel={label} placeholderTextColor={p.textSecondary}
          underlineColorAndroid="transparent" style={{ minHeight: 29, padding: 0, color: p.text, fontSize: 16 }} />
      </View>
      {unit ? <Text style={{ color: p.textSecondary, fontSize: 13 }}>{unit}</Text> : null}
    </View>
  );
}
