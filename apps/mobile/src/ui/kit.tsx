import { useState, type ReactNode } from 'react';
import Animated from 'react-native-reanimated';
import { Platform, Pressable, type PressableProps, useColorScheme, ScrollViewProps, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { fontFamily, metrics, usePalette } from '@/lib/theme';
import { useAppReducedMotion } from '@/lib/motionPref';
import { tick } from '@/lib/haptics';
import { formatMonthLabel, shiftMonth } from '@dmm/core/utils/format';
import { FormScrollView } from './FormScrollView';
import { MonthPicker } from './MonthPicker';

/** Scrollable screen. On iOS the transparent large-title bar insets content automatically. */
export function Screen({ children, ...rest }: ScrollViewProps & { children: ReactNode }) {
  const p = usePalette();
  const Scroll = Platform.OS === 'android' && rest.automaticallyAdjustKeyboardInsets ? FormScrollView : Animated.ScrollView;
  return (
    <Scroll
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: 8 + metrics.screenPaddingTop, gap: 16, paddingBottom: 48 }}
      {...rest}>
      {children}
    </Scroll>
  );
}

export function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: -8 }}>
      <Text style={{ color: p.text, fontSize: 17, fontWeight: '700', fontFamily }}>{children}</Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
          <Text style={{ color: p.tint, fontSize: 15, fontWeight: '500' }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Inset grouped card: rounded container, children separated by hairlines (iOS) / tonal gaps (Android). */
export function Group({ children }: { children: ReactNode }) {
  const p = usePalette();
  const items = Array.isArray(children) ? children.flat().filter(Boolean) : [children];
  return (
    <View style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius, overflow: 'hidden', borderCurve: 'continuous' }}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: p.separator }} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

function iconOnColor(hex: string) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#000000' : '#FFFFFF';
}

export function IconBadge({ name, color, size = 40, filledInDark = false }: {
  name: SymbolViewProps['name']; color: string; size?: number; filledInDark?: boolean;
}) {
  const scheme = useColorScheme();
  const filled = filledInDark && scheme === 'dark';
  const symbol = Platform.OS === 'web' && typeof name === 'object' && !name.web
    ? { ...name, web: name.android }
    : name;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: filled ? color : `${color}24`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <SymbolView name={symbol} size={size * 0.48} tintColor={filled ? iconOnColor(color) : color} />
    </View>
  );
}

export function Row({
  icon,
  iconColor,
  iconFilledInDark,
  title,
  subtitle,
  detail,
  right,
  rightColor,
  onPress,
  onLongPress,
  chevron,
  compact,
}: {
  icon?: SymbolViewProps['name'];
  iconColor?: string;
  iconFilledInDark?: boolean;
  title: string;
  subtitle?: string;
  detail?: string;
  right?: string;
  rightColor?: string;
  onPress?: PressableProps['onPress'];
  onLongPress?: () => void;
  chevron?: boolean;
  compact?: boolean;
}) {
  const p = usePalette();
  const reduceMotion = useAppReducedMotion();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={reduceMotion ? undefined : { color: p.fill }}
      style={({ pressed }) => ({
        minHeight: compact ? 52 : metrics.rowMinHeight,
        paddingHorizontal: compact ? 10 : 16,
        paddingVertical: compact ? 6 : 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: compact ? 8 : 12,
        backgroundColor: pressed ? p.fill : 'transparent',
      })}>
      {icon ? <IconBadge name={icon} color={iconColor ?? p.tint} filledInDark={iconFilledInDark} size={compact ? 32 : undefined} /> : null}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ color: p.text, fontSize: 16, fontWeight: '600', fontFamily }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ color: p.textSecondary, fontSize: 13, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
        {detail ? (
          <Text numberOfLines={3} style={{ color: p.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right ? (
        <Text style={{ color: rightColor ?? p.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{right}</Text>
      ) : null}
      {chevron ? <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={p.textSecondary} /> : null}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  prominent = false,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  prominent?: boolean;
}) {
  const p = usePalette();
  const dark = useColorScheme() === 'dark';
  const activeIndex = options.findIndex((o) => o.id === value);
  return (
    <View style={{ flexDirection: 'row', backgroundColor: p.fill, borderRadius: metrics.controlRadius + 2, padding: 3 }}>
      {options.map((o, i) => {
        const active = i === activeIndex;
        // thin divider between neighbours, hidden next to the selected thumb
        const showDivider = i > 0 && i !== activeIndex && i - 1 !== activeIndex;
        return (
          <View key={o.id} style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ width: StyleSheet.hairlineWidth * 2, marginVertical: 8, backgroundColor: showDivider ? p.textSecondary : 'transparent', opacity: 0.35 }} />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (!active) tick();
                onChange(o.id);
              }}
              style={{
                flex: 1,
                minHeight: 36,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: metrics.controlRadius,
                backgroundColor: active ? (prominent ? p.tint : dark ? 'rgba(255,255,255,0.2)' : p.card) : 'transparent',
                ...(active
                  ? { shadowColor: '#000', shadowOpacity: dark ? 0 : 0.14, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: dark ? 0 : 2 }
                  : null),
              }}>
              <Text style={{ color: active ? (prominent ? p.onTint : p.text) : p.textSecondary, fontSize: 14, fontWeight: active ? '700' : '500' }}>{o.label}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export function MonthBar({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const btn = (delta: number, name: SymbolViewProps['name']) => (
    <Pressable
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={delta < 0 ? '前月' : '翌月'}
      onPress={() => {
        tick();
        onChange(shiftMonth(month, delta));
      }}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={name} size={18} tintColor={p.tint} />
    </Pressable>
  );
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {btn(-1, { ios: 'chevron.left', android: 'chevron_left' })}
        <Pressable accessibilityRole="button" accessibilityLabel={`年月を選ぶ ${formatMonthLabel(month)}`}
          onPress={() => { tick(); setOpen(true); }}
          style={{ minWidth: 150, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Text style={{ color: p.text, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatMonthLabel(month)}</Text>
          <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={12} tintColor={p.tint} />
        </Pressable>
        {btn(1, { ios: 'chevron.right', android: 'chevron_right' })}
      </View>
      {open ? <MonthPicker month={month} onCancel={() => setOpen(false)} onPick={(m) => {
        setOpen(false);
        onChange(m);
      }} /> : null}
    </>
  );
}
