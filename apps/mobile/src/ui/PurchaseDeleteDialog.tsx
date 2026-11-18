import { useState } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '@/lib/theme';

export type PurchaseDeleteAnchor = { x: number; y: number };

export function PurchaseDeleteDialog({ title, anchor, onCancel, onDelete }: {
  title?: string;
  anchor?: PurchaseDeleteAnchor;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const p = usePalette();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(146);
  if (title === undefined) return null;
  const width = Math.min(280, window.width - insets.left - insets.right - 24);
  const leftEdge = insets.left + 12;
  const topEdge = insets.top + 12;
  const bottomEdge = window.height - insets.bottom - 12;
  const x = anchor?.x || window.width / 2;
  const y = anchor?.y || window.height / 2;
  const left = Math.max(leftEdge, Math.min(x - width / 2, window.width - insets.right - width - 12));
  const top = Math.max(topEdge, Math.min(y + 14 + height <= bottomEdge ? y + 14 : y - height - 14, bottomEdge - height));

  return (
    <Modal transparent statusBarTranslucent animationType="fade" visible onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.42)' }}>
        <Pressable accessible={false} onPress={onCancel} style={{ position: 'absolute', inset: 0 }} />
        <View accessibilityViewIsModal onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
          style={{ position: 'absolute', top, left, width, padding: 16, gap: 10, borderRadius: 16, backgroundColor: p.card }}>
          <Text accessibilityRole="header" style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>購入候補を削除しますか？</Text>
          <Text numberOfLines={2} style={{ color: p.textSecondary, fontSize: 15 }}>{title}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Pressable accessibilityRole="button" onPress={onCancel}
              style={({ pressed }) => ({ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center',
                borderRadius: 12, backgroundColor: p.fill, opacity: pressed ? 0.75 : 1 })}>
              <Text style={{ color: p.text, fontWeight: '700' }}>キャンセル</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onDelete}
              style={({ pressed }) => ({ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center',
                borderRadius: 12, backgroundColor: '#B91C1C', opacity: pressed ? 0.75 : 1 })}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>削除</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
