import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { tick } from '@/lib/haptics';

/** A collapsed-by-default section: keeps rarely needed detail out of the way. */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
        onPress={() => { tick(); setOpen((v) => !v); }}
        style={({ pressed }) => ({ minHeight: 48, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
          justifyContent: 'space-between', backgroundColor: pressed ? p.fill : p.card })}>
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        <SymbolView name={open ? { ios: 'chevron.up', android: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more' }} size={14} tintColor={p.textSecondary} />
      </Pressable>
      {open ? children : null}
    </View>
  );
}
