import { useLayoutEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { tick } from '@/lib/haptics';
import { metrics, usePalette } from '@/lib/theme';

const ROW_HEIGHT = 68;

type DragState = {
  from: SharedValue<number>;
  target: SharedValue<number>;
  offset: SharedValue<number>;
};

function ReorderRow({ label, index, count, drag, move, children }: {
  label: string;
  index: number;
  count: number;
  drag: DragState;
  move: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const p = usePalette();
  const { from, target, offset } = drag;
  const gesture = usePanGesture({
    enabled: count > 1,
    activateAfterLongPress: 210,
    maxPointers: 1,
    onActivate: () => {
      'worklet';
      from.value = index;
      target.value = index;
      offset.value = 0;
      scheduleOnRN(tick);
    },
    onUpdate: ({ translationY }) => {
      'worklet';
      offset.value = Math.max(-index * ROW_HEIGHT, Math.min((count - 1 - index) * ROW_HEIGHT, translationY));
      target.value = index + Math.round(offset.value / ROW_HEIGHT);
    },
    onDeactivate: ({ canceled }) => {
      'worklet';
      if (!canceled && target.value !== index) {
        offset.value = (target.value - index) * ROW_HEIGHT;
        scheduleOnRN(move, index, target.value);
      } else {
        from.value = -1;
        target.value = -1;
        offset.value = 0;
      }
    },
  });
  const animation = useAnimatedStyle(() => {
    const active = from.value === index;
    const displacement = from.value >= 0 && index > from.value && index <= target.value ? -ROW_HEIGHT
      : from.value >= 0 && index < from.value && index >= target.value ? ROW_HEIGHT : 0;
    return {
      transform: [{ translateY: active ? offset.value : from.value < 0 ? 0 : withTiming(displacement, { duration: 115 }) }],
      zIndex: active ? 2 : 0,
      backgroundColor: active ? p.fill : p.card,
    };
  });

  return (
    <GestureDetector gesture={gesture} touchAction={count > 1 ? "none" : "pan-y"}>
      <Animated.View collapsable={false} style={[{ height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center',
        borderBottomColor: p.separator, borderBottomWidth: index < count - 1 ? StyleSheet.hairlineWidth : 0 }, animation]}>
        {count > 1 ? (
          <View accessible accessibilityRole="adjustable" accessibilityLabel={`${label}の並び順`}
            accessibilityValue={{ min: 1, max: count, now: index + 1 }} accessibilityHint="長押ししてドラッグ"
            accessibilityActions={[{ name: 'increment', label: '後ろへ移動' }, { name: 'decrement', label: '前へ移動' }]}
            onAccessibilityAction={({ nativeEvent }) => move(index, index + (nativeEvent.actionName === 'increment' ? 1 : -1))}
            style={{ width: 36, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
              {Array.from({ length: 6 }, (_, dot) => (
                <View key={dot} style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: p.textSecondary }} />
              ))}
            </View>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>{children}</View>
      </Animated.View>
    </GestureDetector>
  );
}

export function ReorderList<T extends { id: string }>({ items, renderItem, getLabel, onReorder }: {
  items: T[];
  renderItem: (item: T) => ReactNode;
  getLabel: (item: T) => string;
  onReorder: (ids: string[]) => void;
}) {
  const p = usePalette();
  const from = useSharedValue(-1);
  const target = useSharedValue(-1);
  const offset = useSharedValue(0);
  const orderKey = JSON.stringify(items.map((item) => item.id));

  useLayoutEffect(() => {
    from.value = -1;
    target.value = -1;
    offset.value = 0;
  }, [orderKey, from, target, offset]);

  const move = (start: number, end: number) => {
    if (start === end || !items[start] || !items[end]) return;
    const ids = items.map((item) => item.id);
    const [id] = ids.splice(start, 1);
    ids.splice(end, 0, id);
    onReorder(ids);
  };

  if (!items.length) return null;
  return (
    <View style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius, borderCurve: 'continuous', overflow: 'hidden' }}>
      {items.map((item, index) => (
        <ReorderRow key={item.id} label={getLabel(item)} index={index} count={items.length} drag={{ from, target, offset }} move={move}>
          {renderItem(item)}
        </ReorderRow>
      ))}
    </View>
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
