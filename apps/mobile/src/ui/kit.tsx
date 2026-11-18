import { ReactNode } from 'react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, useColorScheme, ScrollView, ScrollViewProps, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { fontFamily, metrics, usePalette } from '@/lib/theme';
import { tick } from '@/lib/haptics';
import { formatMonthLabel, shiftMonth } from '@dmm/core/utils/format';

/** Scrollable screen. On iOS the transparent large-title bar insets content automatically. */
export function Screen({ children, ...rest }: ScrollViewProps & { children: ReactNode }) {
  const p = usePalette();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: 8 + metrics.screenPaddingTop, gap: 20, paddingBottom: 48 }}
      {...rest}>
      {children}
    </ScrollView>
  );
}

export function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: -8 }}>
      <Text style={{ color: p.text, fontSize: 17, fontWeight: '700', fontFamily }}>{children}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
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

export function IconBadge({ name, color, size = 40 }: { name: SymbolViewProps['name']; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}24`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <SymbolView name={name} size={size * 0.48} tintColor={color} />
    </View>
  );
}

export function Row({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  rightColor,
  onPress,
  onLongPress,
  chevron,
}: {
  icon?: SymbolViewProps['name'];
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: string;
  rightColor?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: p.fill }}
      style={({ pressed }) => ({
        minHeight: metrics.rowMinHeight,
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: pressed ? p.fill : 'transparent',
      })}>
      {icon ? <IconBadge name={icon} color={iconColor ?? p.tint} /> : null}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ color: p.text, fontSize: 16, fontWeight: '600', fontFamily }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ color: p.textSecondary, fontSize: 13, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? (
        <Text style={{ color: rightColor ?? p.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{right}</Text>
      ) : null}
      {chevron ? <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} tintColor={p.textSecondary} /> : null}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
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
                backgroundColor: active ? (dark ? 'rgba(255,255,255,0.2)' : p.card) : 'transparent',
                ...(active
                  ? { shadowColor: '#000', shadowOpacity: dark ? 0 : 0.14, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: dark ? 0 : 2 }
                  : null),
              }}>
              <Text style={{ color: active ? p.text : p.textSecondary, fontSize: 14, fontWeight: active ? '700' : '500' }}>{o.label}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export function MonthBar({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const p = usePalette();
  const base = new Date(`${month}-01T00:00:00`);
  const pickDate = (d: Date) => onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  const btn = (delta: number, name: SymbolViewProps['name']) => (
    <Pressable
      hitSlop={8}
      onPress={() => {
        tick();
        onChange(shiftMonth(month, delta));
      }}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={name} size={18} tintColor={p.tint} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {btn(-1, { ios: 'chevron.left', android: 'chevron_left' })}
      <View style={{ minWidth: 150, alignItems: 'center', justifyContent: 'center', height: 44 }}>
        <Text style={{ color: p.text, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatMonthLabel(month)}</Text>
        {/* Tap the month -> system calendar. iOS: an invisible compact picker laid over the label; Android: Material dialog. */}
        {Platform.OS === 'ios' ? (
          <View style={{ position: 'absolute', inset: 0, opacity: 0.015, alignItems: 'center', justifyContent: 'center' }}>
            <DateTimePicker value={base} mode="date" display="compact" locale="ja-JP" onChange={(_, d) => d && pickDate(d)} />
          </View>
        ) : Platform.OS === 'android' ? (
          <Pressable
            accessibilityLabel="月をカレンダーで選ぶ"
            style={{ position: 'absolute', inset: 0 }}
            onPress={() => DateTimePickerAndroid.open({ value: base, mode: 'date', onChange: (_, d) => d && pickDate(d) })}
          />
        ) : null}
      </View>
      {btn(1, { ios: 'chevron.right', android: 'chevron_right' })}
    </View>
  );
}
