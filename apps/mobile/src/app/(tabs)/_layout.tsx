import type { ComponentProps } from 'react';
import { TabList, TabSlot, Tabs, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, Text } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen as NativeScreen } from 'react-native-screens';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { tick } from '@/lib/haptics';
import { usePalette } from '@/lib/theme';
import { AddButton } from '@/ui/AddButton';

type Tab = 'home' | 'transactions' | 'analytics' | 'accounts';

function TabButton({ label, icon, isFocused, ...props }: ComponentProps<typeof Pressable> & Pick<TabTriggerSlotProps, 'href' | 'isFocused'> & {
  label: string;
  icon: SymbolViewProps['name'];
}) {
  const p = usePalette();
  const emphasis = useSharedValue(0);
  const restColor = isFocused ? p.fill : 'transparent';
  const pressedColor = `${p.tint}42`;
  const capsule = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(emphasis.value, [0, 1], [restColor, pressedColor]),
    transform: [{ scale: 1 - emphasis.value * 0.05 }],
  }));
  const color = isFocused ? p.tint : p.textSecondary;
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }} accessibilityLabel={label}
      onPressIn={() => {
        emphasis.value = withTiming(1, { duration: 65 });
        tick();
      }}
      onPressOut={() => { emphasis.value = withTiming(0, { duration: 185 }); }}
      style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      <Animated.View style={[{ width: 52, height: 30, maxWidth: '100%', borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, capsule]}>
        <SymbolView name={icon} size={21} tintColor={color} />
      </Animated.View>
      <Text style={{ color, fontSize: 11, fontWeight: isFocused ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const p = usePalette();
  const tab = (name: Tab, label: string, icon: SymbolViewProps['name']) => (
    <TabTrigger name={name} href={`/${name}`} resetOnFocus asChild>
      <TabButton label={label} icon={icon} />
    </TabTrigger>
  );

  return (
    <Tabs style={{ flex: 1, backgroundColor: p.bg }} options={{ backBehavior: 'history' }}>
      <TabSlot renderFn={(descriptor, { isFocused, detachInactiveScreens }) => isFocused ? (
        <NativeScreen enabled={detachInactiveScreens} activityState={2} style={{ flex: 1 }}>
          {descriptor.render()}
        </NativeScreen>
      ) : null} />
      <TabList asChild>
        <SafeAreaView edges={['left', 'right', 'bottom']} style={{
          backgroundColor: p.card, borderTopWidth: 1, borderTopColor: p.fill,
          alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6,
        }}>
          {tab('home', 'ホーム', { ios: 'house', android: 'home' })}
          {tab('transactions', '取引', { ios: 'list.bullet.rectangle', android: 'receipt_long' })}
          <AddButton />
          {tab('analytics', '分析', { ios: 'chart.pie', android: 'pie_chart' })}
          {tab('accounts', '口座', { ios: 'wallet.pass', android: 'account_balance_wallet' })}
        </SafeAreaView>
      </TabList>
    </Tabs>
  );
}
