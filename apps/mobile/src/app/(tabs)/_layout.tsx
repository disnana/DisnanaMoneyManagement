import type { ComponentProps } from 'react';
import { TabList, TabSlot, Tabs, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen as NativeScreen } from 'react-native-screens';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { getCurrentMonthKey } from '@dmm/core/utils/format';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { useAppearanceStyle, useThemeColorScheme } from '@/lib/themePref';
import { AddButton } from '@/ui/AddButton';

type Tab = 'home' | 'transactions' | 'analytics' | 'accounts';

function TabButton({ label, icon, modern, isFocused, onPress, onSwitch, ...props }: ComponentProps<typeof Pressable> & Pick<TabTriggerSlotProps, 'href' | 'isFocused'> & {
  label: string;
  modern: boolean;
  icon: SymbolViewProps['name'];
  onSwitch: () => void;
}) {
  const p = usePalette();
  const emphasis = useSharedValue(0);
  const restColor = isFocused && !modern ? p.fill : 'transparent';
  const pressedColor = `${p.tint}42`;
  const capsule = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(emphasis.value, [0, 1], [restColor, pressedColor]),
    transform: [{ scale: 1 - emphasis.value * 0.05 }],
  }));
  const color = isFocused ? p.tint : p.textSecondary;
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }} aria-selected={!!isFocused} accessibilityLabel={label}
      onPress={(event) => {
        if (!isFocused && !event.isDefaultPrevented()) onSwitch();
        onPress?.(event);
      }}
      onPressIn={() => {
        emphasis.value = withTiming(1, { duration: 65 });
        tick();
      }}
      onPressOut={() => { emphasis.value = withTiming(0, { duration: 185 }); }}
      style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: modern ? 1 : 3,
        borderRadius: 25, backgroundColor: modern && isFocused ? p.fill : 'transparent' }}>
      <Animated.View style={[{ width: 52, height: modern ? 26 : 30, maxWidth: '100%', borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, capsule]}>
        <SymbolView name={icon} size={21} tintColor={color} />
      </Animated.View>
      <Text style={{ color, fontSize: 11, fontWeight: isFocused ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const p = usePalette();
  const { state, setMonth } = useFinance();
  const [style] = useAppearanceStyle();
  const scheme = useThemeColorScheme();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const modern = style === 'modern';
  const hideDock = modern && state.accounts.some((account) =>
    account.type === 'credit' && pathname === `/accounts/${encodeURIComponent(account.id)}`);
  const glass = modern && Platform.OS === 'ios' && isLiquidGlassAvailable();
  const tab = (name: Tab, label: string, icon: SymbolViewProps['name']) => (
    <TabTrigger name={name} href={`/${name}`} resetOnFocus asChild>
      <TabButton label={label} icon={icon} modern={modern} onSwitch={() => setMonth(getCurrentMonthKey())} />
    </TabTrigger>
  );

  return (
    <Tabs style={{ flex: 1, backgroundColor: p.bg }} options={{ backBehavior: 'history' }}>
      <TabSlot renderFn={(descriptor, { isFocused, detachInactiveScreens }) => isFocused ? (
        <NativeScreen enabled={detachInactiveScreens} activityState={2} style={{ flex: 1 }}>
          {descriptor.render()}
        </NativeScreen>
      ) : null} />
      {modern ? (
        <TabList asChild>
          <View style={{ display: hideDock ? 'none' : 'flex', flexDirection: 'row', alignItems: 'center', gap: 4,
            marginTop: 4, marginBottom: insets.bottom + 8, marginLeft: Math.max(insets.left, 16),
            marginRight: Math.max(insets.right, 16), paddingHorizontal: 5, paddingVertical: 3 }}>
            {glass ? (
              <GlassView pointerEvents="none" glassEffectStyle="regular" colorScheme={scheme}
                style={[StyleSheet.absoluteFill, { borderRadius: 32 }]} />
            ) : (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 32,
                backgroundColor: p.card, borderColor: p.separator, borderWidth: StyleSheet.hairlineWidth,
                boxShadow: scheme === 'dark' ? '0 3px 12px #00000045' : '0 3px 12px #10252320' }]} />
            )}
            {tab('home', 'ホーム', { ios: 'house', android: 'home' })}
            {tab('transactions', '取引', { ios: 'list.bullet.rectangle', android: 'receipt_long' })}
            <AddButton />
            {tab('analytics', '分析', { ios: 'chart.pie', android: 'pie_chart' })}
            {tab('accounts', '口座', { ios: 'wallet.pass', android: 'account_balance_wallet' })}
          </View>
        </TabList>
      ) : (
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
      )}
    </Tabs>
  );
}
