import { useCallback, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { TabList, TabSlot, Tabs, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Platform, Pressable, Text } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen as NativeScreen } from 'react-native-screens';
import type { SymbolViewProps } from 'expo-symbols';
import { AppSymbol } from '@/ui/AppSymbol';
import { getCurrentMonthKey } from '@dmm/core/utils/format';
import { useAppReducedMotion } from '@/lib/motionPref';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { AddButton } from '@/ui/AddButton';

type Tab = 'home' | 'transactions' | 'analytics' | 'accounts';
type MonthReset = { tab: Tab; month: string };

function TabButton({ label, icon, isFocused, onPress, onSwitch, ...props }: ComponentProps<typeof Pressable> & Pick<TabTriggerSlotProps, 'href' | 'isFocused'> & {
  label: string;
  icon: SymbolViewProps['name'];
  onSwitch: () => void;
}) {
  const p = usePalette();
  const reduceMotion = useAppReducedMotion();
  const emphasis = useSharedValue(0);
  const restColor = isFocused ? p.fill : 'transparent';
  const pressedColor = `${p.tint}42`;
  const capsule = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(emphasis.get(), [0, 1], [restColor, pressedColor]),
    transform: [{ scale: reduceMotion ? 1 : 1 - emphasis.get() * 0.05 }],
  }));
  const color = isFocused ? p.tint : p.textSecondary;
  return (
    <Pressable {...props} accessibilityRole={Platform.OS === 'web' ? 'link' : 'tab'}
      accessibilityState={Platform.OS === 'web' ? undefined : { selected: !!isFocused }}
      {...(Platform.OS === 'web' && isFocused ? { 'aria-current': 'page' as const } : {})}
      accessibilityLabel={label}
      onPress={(event) => {
        if (!isFocused && !event.isDefaultPrevented()) onSwitch();
        onPress?.(event);
      }}
      onPressIn={() => {
        emphasis.set(reduceMotion ? 1 : withTiming(1, { duration: 65 }));
        tick();
      }}
      onPressOut={() => { emphasis.set(reduceMotion ? 0 : withTiming(0, { duration: 185 })); }}
      style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      <Animated.View style={[{ width: 52, height: 30, maxWidth: '100%', borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, capsule]}>
        <AppSymbol name={icon} size={21} tintColor={color} />
      </Animated.View>
      <Text style={{ color, fontSize: 11, fontWeight: isFocused ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

function FocusedTab({ children, reset, onMonthReset }: {
  children: ReactNode;
  reset?: MonthReset;
  onMonthReset: (reset: MonthReset) => void;
}) {
  const { month, setMonth } = useFinance();
  // TabSlot mounts this component only for the focused route. Consume the entry request once.
  const [entryMonth, finishEntry] = useState(() => reset && reset.month !== month ? reset.month : null);
  if (entryMonth !== null && entryMonth === month) finishEntry(null);
  useLayoutEffect(() => {
    if (entryMonth && entryMonth !== month) setMonth(entryMonth);
    if (reset) onMonthReset(reset);
  }, [entryMonth, month, reset, onMonthReset, setMonth]);

  return entryMonth && entryMonth !== month ? null : children;
}

export default function TabsLayout() {
  const p = usePalette();
  // TabSlot already renders the destination after navigation, so recording the
  // pending month does not need to schedule a second render of the tab bar.
  const pendingReset = useRef<MonthReset | undefined>(undefined);
  const clearMonthReset = useCallback((reset: MonthReset) => {
    if (pendingReset.current === reset) pendingReset.current = undefined;
  }, []);
  const tab = (name: Tab, label: string, icon: SymbolViewProps['name']) => (
    <TabTrigger name={name} href={`/${name}`} resetOnFocus asChild>
      <TabButton label={label} icon={icon} onSwitch={() => { pendingReset.current = { tab: name, month: getCurrentMonthKey() }; }} />
    </TabTrigger>
  );

  return (
    <Tabs style={{ flex: 1, backgroundColor: p.bg }} options={{ backBehavior: 'history' }}>
      <TabSlot renderFn={(descriptor, { isFocused, detachInactiveScreens }) => isFocused ? (
        <NativeScreen enabled={detachInactiveScreens} activityState={2} style={{ flex: 1, backgroundColor: p.bg }}>
          <FocusedTab reset={pendingReset.current?.tab === descriptor.route.name ? pendingReset.current : undefined}
            onMonthReset={clearMonthReset}>
            {descriptor.render()}
          </FocusedTab>
        </NativeScreen>
      ) : null} />
      <TabList asChild>
        <SafeAreaView edges={['left', 'right', 'bottom']}
          {...(Platform.OS === 'web' ? { role: 'navigation' as const, 'aria-label': 'メインナビゲーション' } : {})} style={{
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
