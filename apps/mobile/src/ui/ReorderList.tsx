import { useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { metrics, usePalette } from '@/lib/theme';
import { tick } from '@/lib/haptics';

/**
 * A card of rows that can be reordered by dragging the ≡ handle (touch and hold briefly, then drag).
 * Rows may have different heights. The rows are the caller's; the handle is appended on the right.
 */
export function ReorderList<T extends { id: string }>({ items, renderItem, onReorder }: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  onReorder: (ids: string[]) => void;
}) {
  const p = usePalette();
  const active = useSharedValue(-1); // index being dragged
  const hover = useSharedValue(-1); // index it would land on
  const dragY = useSharedValue(0);
  const heights = useSharedValue<number[]>([]);

  const setHeight = useCallback((index: number, h: number) => {
    const next = [...heights.value];
    next[index] = h;
    heights.value = next;
  }, [heights]);

  const finish = useCallback((from: number, to: number) => {
    if (from === to) return;
    const ids = items.map((i) => i.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onReorder(ids);
  }, [items, onReorder]);

  return (
    <View style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius, borderCurve: 'continuous' }}>
      {items.map((item, index) => (
        <DragRow key={item.id} index={index} count={items.length} active={active} hover={hover} dragY={dragY} heights={heights}
          onHeight={setHeight} onDrop={finish}>
          {renderItem(item, index)}
        </DragRow>
      ))}
    </View>
  );
}

function DragRow({ index, count, active, hover, dragY, heights, onHeight, onDrop, children }: {
  index: number; count: number;
  active: SharedValue<number>; hover: SharedValue<number>; dragY: SharedValue<number>; heights: SharedValue<number[]>;
  onHeight: (index: number, h: number) => void; onDrop: (from: number, to: number) => void; children: ReactNode;
}) {
  const p = usePalette();

  const pan = usePanGesture({
    activateAfterLongPress: 170,
    onActivate: () => {
      'worklet';
      active.value = index;
      hover.value = index;
      dragY.value = 0;
      scheduleOnRN(tick);
    },
    onUpdate: ({ translationY }) => {
      'worklet';
      dragY.value = translationY;
      // The dragged row's centre decides where it would land
      const hs = heights.value;
      let top = 0;
      for (let i = 0; i < index; i++) top += hs[i] ?? 0;
      const centre = top + (hs[index] ?? 0) / 2 + translationY;
      let target = count - 1;
      let edge = 0;
      for (let i = 0; i < count; i++) {
        edge += hs[i] ?? 0;
        if (centre < edge) { target = i; break; }
      }
      target = Math.max(0, Math.min(count - 1, target));
      if (target !== hover.value) {
        hover.value = target;
        scheduleOnRN(tick);
      }
    },
    onDeactivate: () => {
      'worklet';
      const to = hover.value;
      const moved = to !== index;
      active.value = -1;
      hover.value = -1;
      if (moved) {
        dragY.value = 0; // rows re-render in their new places
        scheduleOnRN(onDrop, index, to);
      } else {
        dragY.value = withTiming(0, { duration: 140 });
      }
    },
  });

  const style = useAnimatedStyle(() => {
    const a = active.value;
    if (a === index) {
      return { transform: [{ translateY: dragY.value }, { scale: 1.02 }], zIndex: 10, elevation: 6, shadowOpacity: 0.18, opacity: 0.97 };
    }
    let shift = 0;
    if (a >= 0) {
      const h = heights.value[a] ?? 0;
      const to = hover.value;
      if (a < index && index <= to) shift = -h;
      else if (a > index && index >= to) shift = h;
    }
    return { transform: [{ translateY: withTiming(shift, { duration: 120 }) }, { scale: 1 }], zIndex: 0, elevation: 0, shadowOpacity: 0, opacity: 1 };
  });

  return (
    <Animated.View onLayout={(e) => onHeight(index, e.nativeEvent.layout.height)}
      style={[{ backgroundColor: p.card, shadowColor: '#000', shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
        borderTopLeftRadius: index === 0 ? metrics.cardRadius : 0, borderTopRightRadius: index === 0 ? metrics.cardRadius : 0,
        borderBottomLeftRadius: index === count - 1 ? metrics.cardRadius : 0, borderBottomRightRadius: index === count - 1 ? metrics.cardRadius : 0 }, style]}>
      {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: p.separator }} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>{children}</View>
        <GestureDetector gesture={pan}>
          <View accessibilityRole="adjustable" accessibilityLabel="ドラッグして並び替え" hitSlop={6}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: p.textSecondary, fontSize: 24, lineHeight: 26 }}>≡</Text>
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}
