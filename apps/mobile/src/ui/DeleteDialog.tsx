import { Pressable, Text, View } from 'react-native';
import { usePalette } from '@/lib/theme';
import { AnchoredPopover } from './AnchoredPopover';

type DeleteConfirmationProps = {
  heading: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onDelete: () => void;
};

export function DeleteDialog({ visible, ...props }: DeleteConfirmationProps & { visible: boolean }) {
  if (!visible) return null;
  return (
    <AnchoredPopover onClose={props.onCancel} width={340}>
      <DeleteConfirmation {...props} />
    </AnchoredPopover>
  );
}

export function DeleteConfirmation({ heading, title, description, confirmLabel = '削除', onCancel, onDelete }: DeleteConfirmationProps) {
  const p = usePalette();
  return (
    <View style={{ padding: 20, gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>{heading}</Text>
      {title ? <Text numberOfLines={3} style={{ color: p.textSecondary, fontSize: 15 }}>{title}</Text> : null}
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
