import { ReactNode } from 'react';
import { useState } from 'react';
import { Platform, Pressable, type PressableProps, useColorScheme, ScrollView, ScrollViewProps, StyleSheet, Text, View } from 'react-native';
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
  onPress?: PressableProps['onPress'];
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
    <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {btn(-1, { ios: 'chevron.left', android: 'chevron_left' })}
      <View style={{ minWidth: 150, alignItems: 'center', justifyContent: 'center', height: 44 }}>
        <Text style={{ color: p.text, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatMonthLabel(month)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`年月を選ぶ ${formatMonthLabel(month)}`}
          style={{ position: 'absolute', inset: 0 }}
          onPress={() => {
            tick();
            setOpen((v) => !v);
          }}
        />
      </View>
      {btn(1, { ios: 'chevron.right', android: 'chevron_right' })}
      </View>
      {open ? <MonthPanel month={month} onPick={(m) => { onChange(m); setOpen(false); }} /> : null}
    </View>
  );
}

/** Year + month only, expanded in place under the bar: no modal, no animation, instant to open and re-open. */
function MonthPanel({ month, onPick }: { month: string; onPick: (m: string) => void }) {
  const p = usePalette();
  const [selYear, selMonth] = month.split('-').map(Number);
  const [year, setYear] = useState(selYear);
  const stepper = (delta: number, name: SymbolViewProps['name']) => (
    <Pressable hitSlop={10} onPress={() => { tick(); setYear((y) => y + delta); }} style={{ width: 48, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={name} size={18} tintColor={p.tint} />
    </Pressable>
  );
  return (
    <View style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius + 4, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {stepper(-1, { ios: 'chevron.left', android: 'chevron_left' })}
        <Text style={{ color: p.text, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{year}年</Text>
        {stepper(1, { ios: 'chevron.right', android: 'chevron_right' })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const active = year === selYear && m === selMonth;
          return (
            <Pressable
              key={m}
              onPress={() => {
                tick();
                onPick(`${year}-${String(m).padStart(2, '0')}`);
              }}
              style={{
                width: '23%',
                flexGrow: 1,
                minHeight: 46,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: metrics.controlRadius + 2,
                backgroundColor: active ? p.tint : p.fill,
              }}>
              <Text style={{ color: active ? p.onTint : p.text, fontSize: 16, fontWeight: active ? '700' : '500' }}>{m}月</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
