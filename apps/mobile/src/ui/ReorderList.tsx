import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Sortable from 'react-native-sortables';
import { metrics, usePalette } from '@/lib/theme';
import { useScreenScrollRef } from '@/ui/kit';

/**
 * A card of rows that can be reordered by dragging the ≡ handle (react-native-sortables: long-press drag,
 * animated reordering, drop indicator, auto-scroll near the screen edge). Rows may have different heights.
 */
export function ReorderList<T extends { id: string }>({ items, renderItem, onReorder }: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  onReorder: (ids: string[]) => void;
}) {
  const p = usePalette();
  const scrollableRef = useScreenScrollRef();
  return (
    <View style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius, borderCurve: 'continuous', overflow: 'hidden' }}>
      <Sortable.Grid
        columns={1}
        rowGap={0}
        data={items}
        keyExtractor={(item) => item.id}
        customHandle
        scrollableRef={scrollableRef}
        hapticsEnabled
        activeItemScale={1.03}
        activeItemShadowOpacity={0.22}
        inactiveItemOpacity={0.75}
        showDropIndicator
        dropIndicatorStyle={{ backgroundColor: p.tint + '26', borderLeftWidth: 4, borderLeftColor: p.tint }}
        dragActivationDelay={120}
        onDragEnd={({ indexToKey }) => {
          // Only report a change; the list re-renders from the new order the caller saves
          const same = indexToKey.length === items.length && indexToKey.every((id, i) => id === items[i].id);
          if (!same) onReorder(indexToKey);
        }}
        renderItem={({ item, index }) => (
          <View style={{ backgroundColor: p.card }}>
            {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: p.separator }} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>{renderItem(item, index)}</View>
              <Sortable.Handle>
                <View accessibilityLabel="並び替え" accessibilityHint="押したまま上下に動かします"
                  style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: p.textSecondary, fontSize: 24, lineHeight: 26 }}>≡</Text>
                </View>
              </Sortable.Handle>
            </View>
          </View>
        )}
      />
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
