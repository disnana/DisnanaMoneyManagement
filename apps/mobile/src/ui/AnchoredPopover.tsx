import { useState, type ReactNode } from 'react';
import { Modal, Pressable, useWindowDimensions, View, type ModalProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '@/lib/theme';

export type PopoverAnchor = { x: number; y: number };

export function AnchoredPopover({ anchor, onClose, children, width: preferredWidth = 280, initialHeight = 146, bottomLimit, animationType = 'fade' }: {
  anchor: PopoverAnchor;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  initialHeight?: number;
  bottomLimit?: number;
  animationType?: ModalProps['animationType'];
}) {
  const p = usePalette();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(initialHeight);
  const width = Math.min(preferredWidth, window.width - insets.left - insets.right - 24);
  const leftEdge = insets.left + 12;
  const topEdge = insets.top + 12;
  const bottomEdge = (bottomLimit ?? window.height - insets.bottom) - 12;
  const x = anchor.x || window.width / 2;
  const y = anchor.y || window.height / 2;
  const left = Math.max(leftEdge, Math.min(x - width / 2, window.width - insets.right - width - 12));
  const top = Math.max(topEdge, Math.min(y + 14 + height <= bottomEdge ? y + 14 : y - height - 14, bottomEdge - height));

  return (
    <Modal transparent statusBarTranslucent animationType={animationType} visible onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.42)' }}>
        <Pressable accessible={false} onPress={onClose} style={{ position: 'absolute', inset: 0 }} />
        <View accessibilityViewIsModal onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
          style={{ position: 'absolute', top, left, width, borderRadius: 16, overflow: 'hidden', backgroundColor: p.card }}>
          {children}
        </View>
      </View>
    </Modal>
  );
}
