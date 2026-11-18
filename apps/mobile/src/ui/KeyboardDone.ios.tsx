import { InputAccessoryView, Keyboard, Pressable, Text, View } from 'react-native';
import { usePalette } from '@/lib/theme';

/** iOS numeric keypads have no return key: provide the standard "done" accessory bar. */
export const KEYBOARD_ACCESSORY_ID: string | undefined = 'dmm-done-bar';

export function KeyboardDone() {
  const p = usePalette();
  return (
    <InputAccessoryView nativeID={KEYBOARD_ACCESSORY_ID}>
      <View style={{ backgroundColor: p.card, alignItems: 'flex-end', borderTopWidth: 0.5, borderColor: p.separator }}>
        <Pressable onPress={() => Keyboard.dismiss()} style={{ paddingHorizontal: 16, height: 44, justifyContent: 'center' }}>
          <Text style={{ color: p.tint, fontSize: 17, fontWeight: '600' }}>完了</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}
