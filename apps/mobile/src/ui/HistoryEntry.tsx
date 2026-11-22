import { Pressable, Text, View } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { IconBadge } from './kit';
import { AppSymbol } from './AppSymbol';
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
  hasMemo: boolean;
  stacked: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

export function HistoryEntry({ title, subtitle, detail, right, rightColor, icon, iconColor, kind, hasMemo, stacked, onPress, onLongPress }: Props) {
  const p = usePalette();
  const vertical = stacked || right.length >= m.longAmountLength;
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={[title, kind, right, subtitle, detail, hasMemo && 'メモあり'].filter(Boolean).join('、')}
      accessibilityHint="編集を開きます。長押しでその他の操作を選べます。"
      onPress={onPress} onLongPress={onLongPress}
      style={({ pressed }) => [s.entry, { backgroundColor: pressed ? p.fill : p.card }]}>
      <View style={[s.entryLine, vertical && s.stacked]}>
        <Text numberOfLines={vertical ? 3 : 2} style={[s.entryTitle, !vertical && s.expand, { color: p.text }]}>{title}</Text>
        <Text style={[s.amount, { color: rightColor }]}>{right}</Text>
      </View>
      <View style={s.metadata}>
        <IconBadge name={icon} color={iconColor} size={m.badge} filledInDark />
        <Text style={[s.detail, { color: p.textSecondary }]}>{subtitle}</Text>
        {hasMemo ? <AppSymbol name={{ ios: 'note.text', android: 'sticky_note_2' }} size={m.disclosure} tintColor={p.textSecondary} /> : null}
      </View>
      {detail ? <Text style={[s.detail, { color: p.textSecondary }]}>{detail}</Text> : null}
    </Pressable>
  );
}
