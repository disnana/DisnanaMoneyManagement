import { Pressable, Text, View } from 'react-native';
import { usePalette } from '@/lib/theme';
import { AnchoredPopover, type PopoverAnchor } from './AnchoredPopover';

export function AnchoredDeleteDialog({ heading, title, description, anchor, confirmLabel, onCancel, onDelete }: {
  heading: string;
  title?: string;
  description?: string;
  anchor?: PopoverAnchor;
  confirmLabel?: string;
  onCancel: () => void;
  onDelete: () => void;
}) {
  if (title === undefined || anchor === undefined) return null;
  return (
    <AnchoredPopover anchor={anchor} onClose={onCancel} initialHeight={description ? 168 : 146}>
      <DeleteConfirmation heading={heading} title={title} description={description} confirmLabel={confirmLabel} onCancel={onCancel} onDelete={onDelete} />
    </AnchoredPopover>
  );
}

export function DeleteConfirmation({ heading, title, description, confirmLabel = '削除', onCancel, onDelete }: {
  heading: string; title: string; description?: string; confirmLabel?: string; onCancel: () => void; onDelete: () => void;
}) {
  const p = usePalette();
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>{heading}</Text>
      <Text numberOfLines={2} style={{ color: p.textSecondary, fontSize: 15 }}>{title}</Text>
      {description ? <Text style={{ color: p.textSecondary, fontSize: 13 }}>{description}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Pressable accessibilityRole="button" onPress={onCancel}
          style={({ pressed }) => ({ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center',
            borderRadius: 12, backgroundColor: p.fill, opacity: pressed ? 0.75 : 1 })}>
          <Text style={{ color: p.text, fontWeight: '700' }}>キャンセル</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onDelete}
          style={({ pressed }) => ({ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center',
            borderRadius: 12, backgroundColor: '#B91C1C', opacity: pressed ? 0.75 : 1 })}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
