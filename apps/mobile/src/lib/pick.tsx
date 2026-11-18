import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { IconBadge } from '@/ui/kit';

export interface PickOption {
  id: string;
  label: string;
  subtitle?: string;
  icon?: SymbolViewProps['name'];
  color?: string;
  selected?: boolean;
  destructive?: boolean;
}

interface Request {
  description?: string;
  title?: string;
  options: PickOption[];
  resolve: (id: string | null) => void;
}

let listener: ((r: Request | null) => void) | null = null;

export function pickOne(title: string | undefined, options: PickOption[], description?: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!listener) return resolve(null);
    Keyboard.dismiss();
    listener({ title, options, description, resolve });
  });
}

export function PickerHost() {
  const p = usePalette();
  const { height } = useWindowDimensions();
  const [req, setReq] = useState<Request | null>(null);
  const pending = useRef<Request | null>(null);
  const [query, setQuery] = useState('');
  const dragOffset = useSharedValue(0);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragOffset.value }] }));

  useEffect(() => {
    listener = (request) => {
      pending.current?.resolve(null);
      pending.current = request;
      dragOffset.value = 0;
      setQuery('');
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
        dragOffset.value = withTiming(0, { duration: 150 });
      }
    },
  });

  if (!req) return null;
  const normalized = query.trim().normalize('NFKC').toLowerCase();
  const options = req.options.filter((option) =>
    `${option.label} ${option.subtitle ?? ''}`.normalize('NFKC').toLowerCase().includes(normalized)
  );

  const searchable = req.options.length >= 8;
  const content = (
    <>
      <GestureDetector gesture={sheetDrag} touchAction="none">
        <View collapsable={false}>
          <View style={{ alignItems: 'center', justifyContent: 'center', height: 26 }}>
            <View style={{ width: 34, height: 4, borderRadius: 2, backgroundColor: p.textSecondary, opacity: 0.6 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, minHeight: 57 }}>
            <Text accessibilityRole="header" style={{ flex: 1, color: p.text, fontSize: 19, fontWeight: '700' }}>
              {req.title ?? '選択'}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={() => close(null)}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <SymbolView name={{ ios: 'xmark', android: 'close' }} size={19} tintColor={p.text} />
            </Pressable>
          </View>
        </View>
      </GestureDetector>
      {req.description ? (
        <Text style={{ marginHorizontal: 20, marginBottom: 12, lineHeight: 19, color: p.textSecondary, fontSize: 13 }}>
          {req.description}
        </Text>
      ) : null}
      {searchable ? (
        <TextInput accessibilityLabel="候補を検索" placeholder="候補を検索" placeholderTextColor={p.textSecondary}
          value={query} onChangeText={setQuery} clearButtonMode="while-editing"
          style={{ minHeight: 44, paddingHorizontal: 14, marginHorizontal: 16, marginBottom: 8,
            borderRadius: 12, backgroundColor: p.fill, color: p.text, fontSize: 15 }} />
      ) : null}
      <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10 }}>
        {options.map((option) => (
          <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: option.selected }}
            onPress={() => close(option.id)}
            style={({ pressed }) => ({
              paddingHorizontal: 10, minHeight: 52, paddingVertical: 8, flexDirection: 'row',
              alignItems: 'center', gap: 12, borderRadius: 12, backgroundColor: pressed || option.selected ? p.fill : 'transparent',
              borderWidth: req.description ? 1 : 0, borderColor: option.selected ? p.tint : 'transparent',
              marginBottom: req.description ? 6 : 0,
            })}>
            {option.icon ? <IconBadge name={option.icon} color={option.color || p.tint} size={36} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: option.destructive ? p.danger : p.text, fontSize: 16, fontWeight: option.selected ? '700' : '500' }}>
                {option.label}
              </Text>
              {option.subtitle ? <Text style={{ color: p.textSecondary, fontSize: 12 }}>{option.subtitle}</Text> : null}
            </View>
            {option.selected ? (
              <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={18} tintColor={p.tint} />
            ) : null}
          </Pressable>
        ))}
        {options.length === 0 ? (
          <Text style={{ padding: 16, color: p.textSecondary }}>一致する候補がありません</Text>
        ) : null}
      </ScrollView>
    </>
  );

  return (
    <Modal transparent animationType="none" visible onRequestClose={() => close(null)}>
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
    </Modal>
  );
}
