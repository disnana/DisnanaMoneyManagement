import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { AnchoredPopover, type PopoverAnchor } from '@/ui/AnchoredPopover';
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
  title?: string;
  options: PickOption[];
  anchor?: PopoverAnchor;
  resolve: (id: string | null) => void;
}

let listener: ((r: Request | null) => void) | null = null;

export function pickOne(title: string | undefined, options: PickOption[], anchor?: PopoverAnchor): Promise<string | null> {
  return new Promise((resolve) => {
    if (!listener) return resolve(null);
    listener({ title, options, anchor, resolve });
  });
}

export function pickNear(event: GestureResponderEvent, title: string, options: PickOption[]): Promise<string | null> {
  const { pageX: x, pageY: y } = event.nativeEvent;
  Keyboard.dismiss();
  return pickOne(title, options, { x, y });
}

export function PickerHost() {
  const p = usePalette();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [req, setReq] = useState<Request | null>(null);
  const pending = useRef<Request | null>(null);
  const [query, setQuery] = useState('');
  const [keyboardTop, setKeyboardTop] = useState<number>();
  const [dragOffset] = useState(() => new Animated.Value(0));

  useEffect(() => {
    listener = (request) => {
      pending.current?.resolve(null);
      pending.current = request;
      dragOffset.setValue(0);
      setQuery('');
      setKeyboardTop(undefined);
      setReq(request);
    };
    return () => {
      listener = null;
      pending.current?.resolve(null);
      pending.current = null;
    };
  }, [dragOffset]);

  const anchoredSearch = Boolean(req?.anchor && req.options.length >= 8);
  useEffect(() => {
    if (!anchoredSearch || Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      ({ endCoordinates }) => setKeyboardTop(endCoordinates.screenY));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardTop(undefined));
    return () => { show.remove(); hide.remove(); };
  }, [anchoredSearch]);

  const close = useCallback((id: string | null) => {
    pending.current?.resolve(id);
    pending.current = null;
    setReq(null);
  }, []);
  const sheetDrag = useMemo(() => {
    const reset = () => Animated.timing(dragOffset, { toValue: 0, duration: 140, useNativeDriver: Platform.OS !== 'web' }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) => dy > 8 && dy > Math.abs(dx),
      onPanResponderMove: (_, { dy }) => dragOffset.setValue(Math.max(0, dy)),
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy >= 48 || (dy >= 20 && vy > 0.5)) close(null);
        else reset();
      },
      onPanResponderTerminate: reset,
    });
  }, [dragOffset, close]);

  if (!req) return null;
  const normalized = query.trim().normalize('NFKC').toLowerCase();
  const options = req.options.filter((option) =>
    `${option.label} ${option.subtitle ?? ''}`.normalize('NFKC').toLowerCase().includes(normalized)
  );

  const searchable = req.options.length >= 8;
  const bottomLimit = Math.min(height - insets.bottom, keyboardTop ?? height);
  const y = Math.min(req.anchor?.y || height / 2, bottomLimit);
  const space = Math.max(y - insets.top, bottomLimit - y) - 26;
  const panelHeight = Math.min(height * 0.64, space);
  const content = (
    <>
      <View {...(!req.anchor ? sheetDrag.panHandlers : undefined)}>
        {!req.anchor ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', height: 20 }}>
            <View style={{ width: 34, height: 4, borderRadius: 2, backgroundColor: p.textSecondary, opacity: 0.6 }} />
          </View>
        ) : null}
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

  if (req.anchor) {
    const initialHeight = Math.min(panelHeight, 67 + (searchable ? 52 : 0) + req.options.length * 54);
    return <AnchoredPopover anchor={{ x: req.anchor.x, y }} width={340} initialHeight={initialHeight}
      bottomLimit={bottomLimit} animationType="none" onClose={() => close(null)}>
      <View style={{ maxHeight: panelHeight, height: searchable ? initialHeight : undefined }}>{content}</View>
    </AnchoredPopover>;
  }

  return (
    <Modal transparent animationType="none" visible onRequestClose={() => close(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' }}>
        <Pressable accessibilityLabel="選択を閉じる" onPress={() => close(null)} style={{ flex: 1 }} />
        <Animated.View style={{ transform: [{ translateY: dragOffset }] }}>
          <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal
            style={{ backgroundColor: p.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: height * 0.76 }}>
            {content}
          </SafeAreaView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
