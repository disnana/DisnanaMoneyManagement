import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { usePalette } from '@/lib/theme';

export interface PickOption {
  id: string;
  label: string;
  destructive?: boolean;
}

interface Request {
  title?: string;
  options: PickOption[];
  resolve: (id: string | null) => void;
}

let listener: ((r: Request | null) => void) | null = null;

/** Android / default: a Material-style bottom sheet list (rendered by <PickerHost/>). */
export function pickOne(title: string | undefined, options: PickOption[]): Promise<string | null> {
  return new Promise((resolve) => {
    if (!listener) return resolve(null);
    listener({ title, options, resolve });
  });
}

export function PickerHost() {
  const p = usePalette();
  const [req, setReq] = useState<Request | null>(null);

  useEffect(() => {
    listener = setReq;
    return () => {
      listener = null;
    };
  }, []);

  const close = (id: string | null) => {
    req?.resolve(id);
    setReq(null);
  };

  return (
    <Modal transparent animationType="slide" visible={!!req} onRequestClose={() => close(null)}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => close(null)} />
      <View
        style={{
          backgroundColor: p.card,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingBottom: 24,
          maxHeight: '70%',
        }}>
        <View style={{ alignItems: 'center', paddingTop: 10 }}>
          <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: p.fill }} />
        </View>
        {req?.title ? (
          <Text style={{ color: p.textSecondary, fontSize: 14, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
            {req.title}
          </Text>
        ) : null}
        <ScrollView>
          {req?.options.map((o) => (
            <Pressable
              key={o.id}
              android_ripple={{ color: p.fill }}
              onPress={() => close(o.id)}
              style={{ paddingHorizontal: 24, minHeight: 52, justifyContent: 'center' }}>
              <Text style={{ color: o.destructive ? p.danger : p.text, fontSize: 16 }}>{o.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
