import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { tick } from '@/lib/haptics';
import { metrics, usePalette } from '@/lib/theme';

export function CalendarDialog({ title, value, onCancel, onApply, children }: {
  title: string;
  value: string;
  onCancel: () => void;
  onApply: () => void;
  children: ReactNode;
}) {
  const p = usePalette();
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable accessible={false} onPress={onCancel} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.58)' }]} />
        <View accessibilityViewIsModal role="dialog" aria-label={title}
          style={{ width: '100%', maxWidth: 360, padding: 16, gap: 10, borderRadius: metrics.cardRadius + 8,
            borderCurve: 'continuous', backgroundColor: p.card }}>
          <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600' }}>{title}</Text>
          <Text accessibilityLiveRegion="polite" style={{ color: p.text, fontSize: 26, fontWeight: '800',
            fontVariant: ['tabular-nums'] }}>{value}</Text>
          {children}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={onCancel}
              style={({ pressed }) => ({
                minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: metrics.controlRadius,
                backgroundColor: pressed ? p.fill : 'transparent',
              })}>
              <Text style={{ color: p.textSecondary, fontWeight: '600' }}>キャンセル</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => { tick(); onApply(); }}
              style={({ pressed }) => ({
                minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: metrics.controlRadius,
                backgroundColor: p.tint, opacity: pressed ? 0.8 : 1,
              })}>
              <Text style={{ color: p.onTint, fontWeight: '700' }}>適用</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
