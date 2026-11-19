import { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { getOrderedCategories } from '@dmm/core/data/categories';
import type { CategoryDef } from '@dmm/core/types/finance';
import { categoryIcon } from '@/lib/categoryIcons';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { useAppReducedMotion } from '@/lib/motionPref';
import { usePalette } from '@/lib/theme';
import { HeaderAction } from '@/ui/HeaderAction';
import { AnchoredPopover, type PopoverAnchor } from '@/ui/AnchoredPopover';
import { DeleteConfirmation } from '@/ui/AnchoredDeleteDialog';
import { Group, IconBadge, Row, Screen, SectionTitle, Segmented } from '@/ui/kit';

const ROW_HEIGHT = 62;
type Kind = 'expense' | 'income';

function CategoryRow({ category, index, count, from, target, offset, move, menu }: {
  category: CategoryDef;
  index: number;
  count: number;
  from: SharedValue<number>;
  target: SharedValue<number>;
  offset: SharedValue<number>;
  move: (from: number, to: number) => void;
  menu: NonNullable<PressableProps['onPress']>;
}) {
  const p = usePalette();
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
      if (canceled || target.value === index) {
        from.value = -1;
        target.value = -1;
        offset.value = 0;
      } else {
        offset.value = (target.value - index) * ROW_HEIGHT;
        scheduleOnRN(move, index, target.value);
      }
    },
  });
  const reduceMotion = useAppReducedMotion();
  const animation = useAnimatedStyle(() => {
    const active = from.value === index;
    const displacement = from.value >= 0 && index > from.value && index <= target.value ? -ROW_HEIGHT
      : from.value >= 0 && index < from.value && index >= target.value ? ROW_HEIGHT : 0;
    return {
      transform: [{ translateY: active ? offset.value : from.value < 0 || reduceMotion ? displacement : withTiming(displacement, { duration: 115 }) }],
      zIndex: active ? 2 : 0,
      backgroundColor: active ? p.fill : p.card,
    };
  });
  return (
    <Animated.View style={[{ height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center',
      borderBottomColor: p.separator, borderBottomWidth: index < count - 1 ? 1 : 0 }, animation]}>
      <GestureDetector gesture={gesture} touchAction="none">
        <View accessible accessibilityRole="adjustable" accessibilityLabel={`${category.name}の並び順`}
          accessibilityValue={{ min: 1, max: count, now: index + 1 }} accessibilityHint="長押ししてドラッグ"
          accessibilityActions={[{ name: 'increment', label: '後ろへ移動' }, { name: 'decrement', label: '前へ移動' }]}
          onAccessibilityAction={({ nativeEvent }) => {
            const to = index + (nativeEvent.actionName === 'increment' ? 1 : -1);
            if (to >= 0 && to < count) move(index, to);
          }} style={{ width: 44, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
            {Array.from({ length: 6 }, (_, dot) => (
              <View key={dot} style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: p.textSecondary }} />
            ))}
          </View>
        </View>
      </GestureDetector>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/category-detail', params: { id: category.id } })}
        style={{ flex: 1, height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconBadge name={categoryIcon(category.icon ?? category.id)} color={category.color} size={36} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>{category.name}</Text>
          {category.memo ? <Text numberOfLines={1} style={{ color: p.textSecondary, fontSize: 12 }}>{category.memo}</Text> : null}
        </View>
      </Pressable>
      <HeaderAction name={{ ios: 'ellipsis', android: 'more_vert' }} label={`${category.name}のメニュー`} onPress={menu} />
    </Animated.View>
  );
}

export default function Categories() {
  const { type: initial } = useLocalSearchParams<{ type?: string }>();
  const { state, setCategoryOrder, setCategoryHidden } = useFinance();
  const p = usePalette();
  const [type, setType] = useState<Kind>(initial === 'income' ? 'income' : 'expense');
  const [menu, setMenu] = useState<{ category: CategoryDef; anchor: PopoverAnchor; confirming: boolean }>();
  const from = useSharedValue(-1);
  const target = useSharedValue(-1);
  const offset = useSharedValue(0);
  const categories = useMemo(() => getOrderedCategories(type, state.customCategories, state.categoryOrder?.[type], state.hiddenCategoryIds),
    [type, state.customCategories, state.categoryOrder, state.hiddenCategoryIds]);
  const hidden = getOrderedCategories(type, state.customCategories).filter((item) => state.hiddenCategoryIds?.includes(item.id));

  useLayoutEffect(() => {
    from.value = -1;
    target.value = -1;
    offset.value = 0;
  }, [categories, from, target, offset]);

  const move = (start: number, end: number) => {
    const ids = categories.map((category) => category.id);
    if (start === end || !ids[start] || !ids[end]) return;
    const [id] = ids.splice(start, 1);
    ids.splice(end, 0, id);
    setCategoryOrder(type, ids);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'カテゴリ管理', headerRight: () => (
        <HeaderAction name={{ ios: 'plus', android: 'add' }} label="カテゴリを追加" accent
          onPress={() => router.push({ pathname: '/category-editor', params: { type } })} />
      ) }} />
      <Screen>
        <Segmented value={type} onChange={setType} options={[{ id: 'expense', label: '支出' }, { id: 'income', label: '収入' }]} />
        <Text style={{ color: p.textSecondary, fontSize: 13 }}>左のつまみを長押しして並べ替え</Text>
        {categories.length > 0 ? (
          <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: p.card }}>
            {categories.map((category, index) => (
              <CategoryRow key={category.id} category={category} index={index} count={categories.length}
                from={from} target={target} offset={offset} move={move} menu={({ nativeEvent }) => {
                  setMenu({ category, anchor: { x: nativeEvent.pageX, y: nativeEvent.pageY }, confirming: false });
                }} />
            ))}
          </View>
        ) : <Text style={{ color: p.textSecondary }}>表示中のカテゴリはありません</Text>}
        {hidden.length > 0 ? (
          <>
            <SectionTitle>削除したカテゴリ</SectionTitle>
            <Group>
              {hidden.map((category) => (
                <Row key={category.id} title={category.name} right="復元" onPress={() => setCategoryHidden(category.id, false)} />
              ))}
            </Group>
          </>
        ) : null}
      </Screen>
      {menu ? (
        <AnchoredPopover anchor={menu.anchor} onClose={() => setMenu(undefined)}
          width={menu.confirming ? 280 : 180} initialHeight={104}>
          {menu.confirming ? (
            <DeleteConfirmation heading="カテゴリを削除しますか？" title={menu.category.name}
              description="過去の取引にはカテゴリ名が残ります。"
              onCancel={() => setMenu(undefined)} onDelete={() => {
                setCategoryHidden(menu.category.id, true);
                setMenu(undefined);
              }} />
          ) : (
            <>
              <Row title="編集" icon={{ ios: 'pencil', android: 'edit' }} onPress={() => {
                setMenu(undefined);
                router.push({ pathname: '/category-editor', params: { id: menu.category.id } });
              }} />
              <Row title="削除" icon={{ ios: 'trash', android: 'delete' }} iconColor={p.danger}
                onPress={() => setMenu({ ...menu, confirming: true })} />
            </>
          )}
        </AnchoredPopover>
      ) : null}
    </>
  );
}
