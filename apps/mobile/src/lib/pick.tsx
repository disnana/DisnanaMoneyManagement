import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { IconBadge } from '@/ui/kit';

export interface PickOption {
  id: string;
  label: string;
  subtitle?: string;
  icon?: SymbolViewProps['name'];
  color?: string;
  selected?: boolean;
  destructive?: boolean;
}

interface Request {
  title?: string;
  options: PickOption[];
  resolve: (id: string | null) => void;
}

let listener: ((r: Request | null) => void) | null = null;

export function pickOne(title: string | undefined, options: PickOption[]): Promise<string | null> {
  return new Promise((resolve) => {
    if (!listener) return resolve(null);
    listener({ title, options, resolve });
  });
}

export function PickerHost() {
  const p = usePalette();
  const { height } = useWindowDimensions();
  const [req, setReq] = useState<Request | null>(null);
  const pending = useRef<Request | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    listener = (request) => {
      pending.current?.resolve(null);
      pending.current = request;
      setQuery('');
      setReq(request);
    };
    return () => {
      listener = null;
      pending.current?.resolve(null);
      pending.current = null;
    };
  }, []);

  const close = (id: string | null) => {
    pending.current?.resolve(id);
    pending.current = null;
    setReq(null);
  };

  const normalized = query.trim().normalize('NFKC').toLowerCase();
  const options = req?.options.filter((option) =>
    `${option.label} ${option.subtitle ?? ''}`.normalize('NFKC').toLowerCase().includes(normalized)
  );

  return (
    <Modal transparent animationType="none" visible={!!req} onRequestClose={() => close(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' }}>
        <Pressable accessibilityLabel="選択を閉じる" onPress={() => close(null)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal
          style={{ backgroundColor: p.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: height * 0.76 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, minHeight: 57 }}>
            <Text accessibilityRole="header" style={{ flex: 1, color: p.text, fontSize: 19, fontWeight: '700' }}>
              {req?.title ?? '選択'}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={() => close(null)}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <SymbolView name={{ ios: 'xmark', android: 'close' }} size={19} tintColor={p.text} />
            </Pressable>
          </View>
          {(req?.options.length ?? 0) >= 8 ? (
            <TextInput accessibilityLabel="候補を検索" placeholder="候補を検索" placeholderTextColor={p.textSecondary}
              value={query} onChangeText={setQuery} clearButtonMode="while-editing"
              style={{ minHeight: 44, paddingHorizontal: 14, marginHorizontal: 16, marginBottom: 8,
                borderRadius: 12, backgroundColor: p.fill, color: p.text, fontSize: 15 }} />
          ) : null}
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10 }}>
            {options?.map((option) => (
              <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: option.selected }}
                onPress={() => close(option.id)}
                style={({ pressed }) => ({
                  paddingHorizontal: 10, minHeight: 52, paddingVertical: 8, flexDirection: 'row',
                  alignItems: 'center', gap: 12, borderRadius: 12, backgroundColor: pressed || option.selected ? p.fill : 'transparent',
                })}>
                {option.icon ? <IconBadge name={option.icon} color={option.color || p.tint} size={36} /> : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: option.destructive ? p.danger : p.text, fontSize: 16, fontWeight: option.selected ? '700' : '500' }}>
                    {option.label}
                  </Text>
                  {option.subtitle ? <Text style={{ color: p.textSecondary, fontSize: 12 }}>{option.subtitle}</Text> : null}
                </View>
                {option.selected ? (
                  <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={18} tintColor={p.tint} />
                ) : null}
              </Pressable>
            ))}
            {options?.length === 0 ? (
              <Text style={{ padding: 16, color: p.textSecondary }}>一致する候補がありません</Text>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
