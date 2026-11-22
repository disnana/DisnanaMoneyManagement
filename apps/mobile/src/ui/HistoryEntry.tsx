import { Pressable, Text, View } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { IconBadge } from './kit';
import { historyMetrics as m, historyStyles as s } from './historyStyles';

type Props = {
  title: string;
  subtitle: string;
  detail?: string;
  right: string;
  rightColor: string;
  icon: SymbolViewProps['name'];
  iconColor: string;
  kind: string;
  stacked: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

export function HistoryEntry({ title, subtitle, detail, right, rightColor, icon, iconColor, kind, stacked, onPress, onLongPress }: Props) {
  const p = usePalette();
  const vertical = stacked || right.length > 12;
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={[title, kind, right, subtitle, detail].filter(Boolean).join('、')}
      accessibilityHint="編集を開きます。長押しでその他の操作を選べます。"
      onPress={onPress} onLongPress={onLongPress}
      style={({ pressed }) => [s.entry, { backgroundColor: pressed ? p.fill : p.card }]}>
      <IconBadge name={icon} color={iconColor} size={m.badge} filledInDark />
      <View style={s.entryBody}>
        <View style={[s.entryLine, vertical && s.stacked]}>
          <Text numberOfLines={vertical ? undefined : 2} style={[s.entryTitle, !vertical && s.expand, { color: p.text }]}>{title}</Text>
          <Text style={[s.amount, { color: rightColor }]}>{right}</Text>
        </View>
        <Text numberOfLines={vertical ? undefined : 2} style={[s.detail, { color: p.textSecondary }]}>{subtitle}</Text>
        {detail ? <Text numberOfLines={vertical ? undefined : 3} style={[s.detail, { color: p.textSecondary }]}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}
