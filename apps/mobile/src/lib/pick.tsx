import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useAppReducedMotion } from '@/lib/motionPref';
import { usePalette } from '@/lib/theme';
import { IconBadge } from '@/ui/kit';
import { ReorderList } from '@/ui/ReorderList';

export interface PickOption {
  id: string;
  label: string;
  subtitle?: string;
  searchText?: string;
  icon?: SymbolViewProps['name'];
  color?: string;
  selected?: boolean;
  destructive?: boolean;
  reorderable?: false;
}

interface PickerPresentation {
  description?: string;
  layout?: 'divided';
  searchLabel?: string;
  reorderTitle?: string;
  onReorder?: (ids: string[]) => void;
}

interface Request extends PickerPresentation {
  title?: string;
  options: PickOption[];
  resolve: (id: string | null) => void;
}

let listener: ((r: Request | null) => void) | null = null;

export function pickOne(title: string | undefined, options: PickOption[], presentation?: PickerPresentation): Promise<string | null> {
  return new Promise((resolve) => {
    if (!listener) return resolve(null);
    Keyboard.dismiss();
    listener({ title, options, ...presentation, resolve });
  });
}

export function PickerHost() {
  const p = usePalette();
  const reduceMotion = useAppReducedMotion();
  const { height } = useWindowDimensions();
  const [req, setReq] = useState<Request | null>(null);
  const pending = useRef<Request | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<PickOption[]>();
  const dragOffset = useSharedValue(0);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragOffset.value }] }));

  useEffect(() => {
    listener = (request) => {
      pending.current?.resolve(null);
      pending.current = request;
      dragOffset.value = 0;
      setQuery('');
      setDraft(undefined);
      setReq(request);
    };
    return () => {
      listener = null;
      pending.current?.resolve(null);
      pending.current = null;
    };
  }, [dragOffset]);

  const close = useCallback((id: string | null) => {
    pending.current?.resolve(id);
    pending.current = null;
    setReq(null);
    setDraft(undefined);
  }, []);
  const sheetDrag = usePanGesture({
    maxPointers: 1,
    activeOffsetY: 5,
    failOffsetX: [-18, 18],
    onActivate: () => {
      'worklet';
      cancelAnimation(dragOffset);
    },
    onUpdate: ({ translationY }) => {
      'worklet';
      dragOffset.value = Math.max(0, translationY);
    },
    onDeactivate: ({ canceled, translationY, velocityY }) => {
      'worklet';
      if (!canceled && (translationY >= 48 || (translationY >= 18 && velocityY >= 500))) {
        scheduleOnRN(close, null);
      } else {
        dragOffset.value = reduceMotion ? 0 : withTiming(0, { duration: 150 });
      }
    },
  });

  if (!req) return null;
  const normalized = query.trim().normalize('NFKC').toLowerCase();
  const options = req.options.filter((option) =>
    `${option.label} ${option.subtitle ?? ''} ${option.searchText ?? ''}`.normalize('NFKC').toLowerCase().includes(normalized)
  );

  const movable = req.options.filter((option) => option.reorderable !== false);
  const searchable = movable.length >= 8;
  const divided = req.layout === 'divided';
  const divider = p.outline;
  const searchLabel = req.searchLabel ?? '候補を検索';
  const saveOrder = () => {
    if (!draft) return;
    const ids = draft.map((item) => item.id);
    if (ids.some((id, index) => id !== movable[index].id)) req.onReorder?.(ids);
    let index = 0;
    setReq({ ...req, options: req.options.map((option) => option.reorderable === false ? option : draft[index++]) });
    setDraft(undefined);
  };
  const optionContent = (option: PickOption) => (
    <>
      {option.icon ? <IconBadge name={option.icon} color={option.color || p.tint} size={36} filledInDark={divided} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={divided ? 2 : undefined} style={{ color: option.destructive ? p.danger : p.text, fontSize: 16, fontWeight: option.selected ? '700' : '500' }}>
          {option.label}
        </Text>
        {option.subtitle ? <Text numberOfLines={draft ? 1 : undefined} style={{ color: p.textSecondary, fontSize: 12 }}>{option.subtitle}</Text> : null}
      </View>
      {option.selected ? (
        <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={18} tintColor={p.tint} />
      ) : null}
    </>
  );
  const content = (
    <>
      <GestureDetector gesture={sheetDrag} touchAction="none">
        <View collapsable={false}>
          <View style={{ alignItems: 'center', justifyContent: 'center', height: 26 }}>
            <View style={{ width: 34, height: 4, borderRadius: 2, backgroundColor: p.textSecondary, opacity: 0.6 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, minHeight: 57 }}>
            <Text accessibilityRole="header" style={{ flex: 1, color: p.text, fontSize: 19, fontWeight: '700' }}>
              {draft ? req.reorderTitle ?? '口座の並べ替え' : req.title ?? '選択'}
            </Text>
            {draft ? (
              <>
                <Pressable accessibilityRole="button" onPress={() => setDraft(undefined)}
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
                  <Text style={{ color: p.textSecondary, fontSize: 14 }}>キャンセル</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={saveOrder}
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
                  <Text style={{ color: p.tint, fontSize: 15, fontWeight: '700' }}>完了</Text>
                </Pressable>
              </>
            ) : (
              <>
                {req.onReorder && movable.length > 1 ? (
                  <Pressable accessibilityRole="button" onPress={() => {
                    Keyboard.dismiss();
                    setQuery('');
                    setDraft(movable);
                  }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
                    <Text style={{ color: p.tint, fontSize: 14, fontWeight: '600' }}>並べ替え</Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={() => close(null)}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <SymbolView name={{ ios: 'xmark', android: 'close' }} size={19} tintColor={p.text} />
                </Pressable>
              </>
            )}
          </View>
        </View>
      </GestureDetector>
      {req.description ? (
        <Text style={{ marginHorizontal: 20, marginBottom: 12, lineHeight: 19, color: p.textSecondary, fontSize: 13 }}>
          {req.description}
        </Text>
      ) : null}
      {draft ? (
        <Text style={{ color: p.textSecondary, fontSize: 13, paddingHorizontal: 20, paddingBottom: 8 }}>
          行を長押しして上下に移動
        </Text>
      ) : searchable ? (
        <TextInput accessibilityLabel={searchLabel} placeholder={searchLabel} placeholderTextColor={p.textSecondary}
          value={query} onChangeText={setQuery} clearButtonMode="while-editing"
          style={{ minHeight: 44, paddingHorizontal: 14, marginHorizontal: 16, marginBottom: 8,
            borderRadius: 12, backgroundColor: p.fill, color: p.text, fontSize: 15 }} />
      ) : null}
      <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: divided ? 16 : 12, paddingBottom: 10 }}>
        {draft ? (
          <ReorderList items={draft} getLabel={(option) => option.label}
            renderItem={(option) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 12 }}>
                {optionContent(option)}
              </View>
            )}
            onReorder={(ids) => setDraft((current) => {
              if (!current) return current;
              const byId = new Map(current.map((option) => [option.id, option]));
              const updated = ids.flatMap((id) => byId.get(id) ?? []);
              return updated.length === current.length ? updated : current;
            })} />
        ) : options.length > 0 ? options.map((option, index) => (
          <View key={option.id}>
            {divided && index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: 10, backgroundColor: divider }} /> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ selected: option.selected }}
              aria-pressed={divided ? Boolean(option.selected) : undefined} onPress={() => close(option.id)}
              style={({ pressed }) => ({
                paddingHorizontal: 10, minHeight: divided ? 54 : 52, paddingVertical: 8, flexDirection: 'row',
                alignItems: 'center', gap: 12, borderRadius: 12,
                backgroundColor: pressed ? p.fill : option.selected ? (divided ? `${p.tint}0D` : p.fill) : 'transparent',
                borderWidth: req.description ? 1 : 0, borderColor: option.selected ? p.tint : 'transparent',
                marginBottom: req.description ? 6 : 0,
              })}>
              {divided && option.selected ? (
                <View style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2,
                  backgroundColor: p.tint, opacity: 0.5 }} />
              ) : null}
              {optionContent(option)}
            </Pressable>
          </View>
        )) : (
          <Text style={{ padding: 16, color: p.textSecondary }}>一致する候補がありません</Text>
        )}
      </ScrollView>
    </>
  );

  const android = Platform.OS === 'android';
  const sheet = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' }}>
        <Pressable accessibilityLabel="選択を閉じる" onPress={() => close(null)} style={{ flex: 1 }} />
        <Animated.View style={[{ height: height * 0.76, flexShrink: 1 }, sheetStyle]}>
          <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal
            style={{ flex: 1, backgroundColor: p.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            {content}
          </SafeAreaView>
        </Animated.View>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );

  return (
    <Modal transparent animationType="none" visible onRequestClose={() => close(null)}
      statusBarTranslucent={android} navigationBarTranslucent={android}>
      {/* Android hosts the modal in its own window, so read the insets there. */}
      {android ? <SafeAreaProvider>{sheet}</SafeAreaProvider> : sheet}
    </Modal>
  );
}
