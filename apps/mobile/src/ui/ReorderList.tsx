import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { metrics, usePalette } from '@/lib/theme';
import { tick } from '@/lib/haptics';
import { setDragging } from '@/lib/dragState';

const CANCEL_MARGIN = 56; // dropping this far above/below the list cancels the drag

/**
 * A card of rows that can be reordered by dragging the ≡ handle (touch and hold briefly, then drag).
 * Rows may have different heights. Drop outside the list to cancel. The page does not scroll while dragging.
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
  const outside = useSharedValue(false);
  const heights = useSharedValue<number[]>([]);
  const orderKey = items.map((i) => i.id).join('|');

  // The new order is on screen now: drop every drag transform in the same frame
  useLayoutEffect(() => {
    active.value = -1;
    hover.value = -1;
    dragY.value = 0;
    outside.value = false;
  }, [orderKey, active, hover, dragY, outside]);

  const setHeight = useCallback((index: number, h: number) => {
    const next = [...heights.value];
    next[index] = h;
    heights.value = next;
  }, [heights]);

  // The gesture callbacks are created once and run on another thread: they must not close over stale
  // props, so the current order and handler are read through refs.
  const idsRef = useRef<string[]>([]);
  const onReorderRef = useRef(onReorder);
  useLayoutEffect(() => {
    idsRef.current = items.map((i) => i.id);
    onReorderRef.current = onReorder;
  });
  const finish = useCallback((from: number, to: number) => {
    if (from === to) return;
    const ids = [...idsRef.current];
    if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onReorderRef.current(ids);
  }, []);

  return (
    <View style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius, borderCurve: 'continuous' }}>
      <LandingSlot active={active} hover={hover} outside={outside} heights={heights} />
      {items.map((item, index) => (
        <DragRow key={item.id} index={index} count={items.length} active={active} hover={hover} dragY={dragY} outside={outside}
          heights={heights} onHeight={setHeight} onDrop={finish} onStep={(delta) => finish(index, index + delta)}>
          {renderItem(item, index)}
        </DragRow>
      ))}
    </View>
  );
}

/** Tinted placeholder showing exactly where the dragged row will land (it sits in the gap the other rows open). */
function LandingSlot({ active, hover, outside, heights }: {
  active: SharedValue<number>; hover: SharedValue<number>; outside: SharedValue<boolean>; heights: SharedValue<number[]>;
}) {
  const p = usePalette();
  const style = useAnimatedStyle(() => {
    const a = active.value;
    if (a < 0 || outside.value) return { opacity: 0, height: 0 };
    const hs = heights.value;
    const to = hover.value;
    let top = 0;
    for (let i = 0; i < to; i++) top += hs[i] ?? 0;
    if (to > a) top += (hs[to] ?? 0) - (hs[a] ?? 0);
    return { opacity: 1, height: hs[a] ?? 0, transform: [{ translateY: withTiming(top, { duration: 120 }) }] };
  });
  return (
    <Animated.View pointerEvents="none"
      style={[{ position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: p.tint + '22', borderLeftWidth: 4, borderLeftColor: p.tint }, style]} />
  );
}

function DragRow({ index, count, active, hover, dragY, outside, heights, onHeight, onDrop, onStep, children }: {
  index: number; count: number;
  active: SharedValue<number>; hover: SharedValue<number>; dragY: SharedValue<number>; outside: SharedValue<boolean>;
  heights: SharedValue<number[]>;
  onHeight: (index: number, h: number) => void; onDrop: (from: number, to: number) => void; onStep: (delta: -1 | 1) => void; children: ReactNode;
}) {
  const p = usePalette();
  // Heights are stored by position. When the order changes a row moves to another position without being
  // re-laid-out (no onLayout), so it must report its own height again from the new index.
  const measured = useRef(0);
  useLayoutEffect(() => {
    if (measured.current) onHeight(index, measured.current);
  }, [index, onHeight]);
  // Rows keep their identity when the order changes, so index/count are shared values kept current
  const indexSv = useSharedValue(index);
  const countSv = useSharedValue(count);
  useLayoutEffect(() => {
    indexSv.value = index;
    countSv.value = count;
  }, [index, count, indexSv, countSv]);

  const pan = usePanGesture({
    // No long-press delay (like the system reorder control): the page stops scrolling the moment the handle is
    // touched, so a quick drag can never turn into a scroll.
    minDistance: 3,
    onBegin: () => {
      'worklet';
      scheduleOnRN(setDragging, true);
    },
    onActivate: () => {
      'worklet';
      active.value = indexSv.value;
      hover.value = indexSv.value;
      dragY.value = 0;
      outside.value = false;
      scheduleOnRN(tick);
    },
    onUpdate: ({ translationY }) => {
      'worklet';
      dragY.value = translationY;
      const index = indexSv.value;
      const count = countSv.value;
      const hs = heights.value;
      let total = 0;
      for (let i = 0; i < count; i++) total += hs[i] ?? 0;
      let top = 0;
      for (let i = 0; i < index; i++) top += hs[i] ?? 0;
      const centre = top + (hs[index] ?? 0) / 2 + translationY;
      const cancelling = centre < -CANCEL_MARGIN || centre > total + CANCEL_MARGIN;
      if (cancelling !== outside.value) {
        outside.value = cancelling;
        scheduleOnRN(tick);
      }
      let target = index;
      if (!cancelling) {
        target = count - 1;
        let edge = 0;
        for (let i = 0; i < count; i++) {
          edge += hs[i] ?? 0;
          if (centre < edge) { target = i; break; }
        }
      }
      if (target !== hover.value) {
        hover.value = target;
        if (!cancelling) scheduleOnRN(tick);
      }
    },
    onDeactivate: ({ canceled }) => {
      'worklet';
      const index = indexSv.value;
      const hs = heights.value;
      const to = canceled || outside.value ? index : hover.value;
      if (to === index) {
        // Cancelled or dropped back where it was: slide home, nothing changes
        hover.value = index;
        dragY.value = withTiming(0, { duration: 160 }, () => { active.value = -1; hover.value = -1; outside.value = false; });
        return;
      }
      // Slide the row into the gap it opened, then commit the new order
      let offset = 0;
      if (to > index) for (let i = index + 1; i <= to; i++) offset += hs[i] ?? 0;
      else for (let i = to; i < index; i++) offset -= hs[i] ?? 0;
      dragY.value = withTiming(offset, { duration: 130 }, (finished) => {
        if (finished) scheduleOnRN(onDrop, index, to);
        else { active.value = -1; hover.value = -1; }
      });
    },
    onFinalize: () => {
      'worklet';
      scheduleOnRN(setDragging, false);
    },
  });

  const style = useAnimatedStyle(() => {
    const a = active.value;
    const index = indexSv.value;
    if (a === index) {
      return {
        transform: [{ translateY: dragY.value }, { scale: 1.02 }], zIndex: 10, elevation: 6, shadowOpacity: 0.18,
        opacity: outside.value ? 0.5 : 0.97,
      };
    }
    if (a < 0) return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0, elevation: 0, shadowOpacity: 0, opacity: 1 };
    let shift = 0;
    const h = heights.value[a] ?? 0;
    const to = hover.value;
    if (a < index && index <= to) shift = -h;
    else if (a > index && index >= to) shift = h;
    return { transform: [{ translateY: withTiming(shift, { duration: 120 }) }, { scale: 1 }], zIndex: 0, elevation: 0, shadowOpacity: 0, opacity: 1 };
  });

  return (
    <Animated.View onLayout={(e) => { measured.current = e.nativeEvent.layout.height; onHeight(index, measured.current); }}
      style={[{ backgroundColor: p.card, shadowColor: '#000', shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
        borderTopLeftRadius: index === 0 ? metrics.cardRadius : 0, borderTopRightRadius: index === 0 ? metrics.cardRadius : 0,
        borderBottomLeftRadius: index === count - 1 ? metrics.cardRadius : 0, borderBottomRightRadius: index === count - 1 ? metrics.cardRadius : 0 }, style]}>
      {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: p.separator }} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>{children}</View>
        <GestureDetector gesture={pan}>
          <View accessible accessibilityRole="adjustable" accessibilityLabel="並び替え" accessibilityHint="ドラッグ、または上下の操作で移動"
            accessibilityActions={[{ name: 'increment', label: '1つ下へ' }, { name: 'decrement', label: '1つ上へ' }]}
            onAccessibilityAction={(e) => {
              // VoiceOver / Switch Control alternative to the drag gesture
              if (e.nativeEvent.actionName === 'increment' && index < count - 1) onStep(1);
              if (e.nativeEvent.actionName === 'decrement' && index > 0) onStep(-1);
            }} hitSlop={6}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: p.textSecondary, fontSize: 24, lineHeight: 26 }}>≡</Text>
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

/** "キャンセル" restores the order from before sorting started; "完了" keeps it. */
export function SortActions({ title, onCancel, onDone, cancelLabel = 'キャンセル' }: {
  title: string; onCancel?: () => void; onDone: () => void; cancelLabel?: string;
}) {
  const p = usePalette();
  const btn = (label: string, onPress: () => void, color: string, weight: '500' | '700') => (
    <Pressable accessibilityRole="button" hitSlop={10} onPress={onPress}>
      <Text style={{ color, fontSize: 15, fontWeight: weight }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: -8 }}>
      <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        {onCancel ? btn(cancelLabel, onCancel, p.textSecondary, '500') : null}
        {btn('完了', onDone, p.tint, '700')}
      </View>
    </View>
  );
}
