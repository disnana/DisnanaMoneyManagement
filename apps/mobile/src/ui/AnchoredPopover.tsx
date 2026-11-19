import { useState, type ReactNode } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppReducedMotion } from '@/lib/motionPref';
import { usePalette } from '@/lib/theme';

export type PopoverAnchor = { x: number; y: number };

export function AnchoredPopover({ anchor, onClose, children, width: preferredWidth = 280, initialHeight = 146, instant = false }: {
  anchor?: PopoverAnchor;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  initialHeight?: number;
  instant?: boolean;
}) {
  const p = usePalette();
  const reduceMotion = useAppReducedMotion();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(initialHeight);
  const width = Math.min(preferredWidth, window.width - insets.left - insets.right - 24);
  const leftEdge = insets.left + 12;
  const topEdge = insets.top + 12;
  const bottomEdge = window.height - insets.bottom - 12;
  const x = anchor?.x || window.width / 2;
  const y = anchor?.y || window.height / 2;
  const left = Math.max(leftEdge, Math.min(x - width / 2, window.width - insets.right - width - 12));
  const top = Math.max(topEdge, Math.min(y + 14 + height <= bottomEdge ? y + 14 : y - height - 14, bottomEdge - height));

  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType={instant || reduceMotion ? 'none' : 'fade'} visible onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.42)' }}>
        <Pressable accessible={false} onPress={onClose} style={{ position: 'absolute', inset: 0 }} />
        <View accessibilityViewIsModal onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
          style={{ ...(anchor ? { position: 'absolute', top, left } : {}), width, borderRadius: 16, overflow: 'hidden',
            borderWidth: 1, borderColor: p.outline, backgroundColor: p.card }}>
          {children}
        </View>
      </View>
    </Modal>
  );
}
