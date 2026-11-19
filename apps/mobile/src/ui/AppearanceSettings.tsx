import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { useAppearanceColor, useAppearanceStyle, useThemePref, type AppearanceStyle, type ThemePref } from '@/lib/themePref';
import { tick } from '@/lib/haptics';
import { pickOne } from '@/lib/pick';
import { Group, Row, Segmented } from './kit';

const choices = [
  [{ id: 'standard', label: '標準', detail: '今の配置' }, { id: 'classic', label: 'クラシック', detail: '一覧で読む' }],
  [{ id: 'modern', label: 'モダン', detail: '数字とグラフで見る' }, { id: 'soft', label: 'やわらか', detail: '余白を広く' }],
] as const;

function LayoutDiagram({ style }: { style: AppearanceStyle }) {
  const p = usePalette();
  const sheet = { backgroundColor: p.card, borderWidth: 1, borderColor: p.outline };
  const line = { backgroundColor: p.textSecondary, height: 3, borderRadius: 2 };
  const metric = { backgroundColor: p.tint, height: 5, borderRadius: 2 };

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
      style={{ height: 60, padding: 6, gap: 4, backgroundColor: p.bg, borderRadius: 8 }}>
      {style === 'standard' ? (
        <>
          <View style={{ ...sheet, flex: 1, borderRadius: 5, padding: 5, justifyContent: 'space-between' }}>
            <View style={{ ...line, width: '31%' }} />
            <View style={{ ...metric, width: '52%' }} />
          </View>
          <View style={{ ...sheet, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderRadius: 5 }}>
            {[0, 1, 2].map((i) => <View key={i} style={{ ...line, width: '19%' }} />)}
          </View>
        </>
      ) : style === 'classic' ? (
        <View style={{ ...sheet, flex: 1, borderRadius: 3 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ flex: 1, borderTopWidth: i ? 1 : 0, borderTopColor: p.separator,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5 }}>
              <View style={{ ...line, width: '30%' }} />
              <View style={{ ...metric, width: '19%', height: 3 }} />
            </View>
          ))}
        </View>
      ) : style === 'modern' ? (
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flex: 1, paddingHorizontal: 6, justifyContent: 'center', backgroundColor: p.tint + '24', borderRadius: 8 }}>
            <View style={{ ...metric, width: '58%', height: 6 }} />
          </View>
          <View style={{ flex: 1, paddingHorizontal: 6, gap: 4, justifyContent: 'center', backgroundColor: p.card, borderRadius: 7 }}>
            <View style={{ flexDirection: 'row', gap: 2 }}>
              <View style={{ ...metric, flex: 2, height: 4 }} />
              <View style={{ ...line, flex: 1, height: 4 }} />
            </View>
            <View style={{ ...line, width: '75%', height: 2 }} />
          </View>
        </View>
      ) : (
        <View style={{ ...sheet, flex: 1, gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }}>
          <View style={{ ...line, width: '24%' }} />
          <View style={{ ...metric, width: '42%', height: 6 }} />
          <View style={{ backgroundColor: p.fill, width: '78%', borderRadius: 6, height: 9, marginTop: 2 }} />
        </View>
      )}
    </View>
  );
}

function StyleOption({ id, label, detail, selected, onPress }: {
  id: AppearanceStyle; label: string; detail: string; selected: boolean; onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} aria-checked={selected}
      accessibilityLabel={label} accessibilityHint={detail}
      onPress={onPress} style={({ pressed }) => ({
        flex: 1, padding: 8, gap: 7, borderRadius: p.cardRadius, borderWidth: 1,
        borderColor: selected ? p.tint : p.outline, backgroundColor: pressed || selected ? p.fill : p.card,
      })}>
      <LayoutDiagram style={id} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 3 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: p.text, fontWeight: '700', fontSize: 14 }}>{label}</Text>
          <Text style={{ color: p.textSecondary, fontSize: 11 }}>{detail}</Text>
        </View>
        {selected ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} size={16} tintColor={p.tint} /> : null}
      </View>
    </Pressable>
  );
}

export function AppearanceSettings() {
  const p = usePalette();
  const standard = usePalette('standard');
  const navy = usePalette('navy');
  const violet = usePalette('violet');
  const terracotta = usePalette('terracotta');
  const [pref, setPref] = useThemePref();
  const [style, setStyle] = useAppearanceStyle();
  const [color, setColor] = useAppearanceColor();
  const colors = [
    { id: 'standard', label: '青緑（標準）', color: standard.tint },
    { id: 'navy', label: '生成り・紺', color: navy.tint },
    { id: 'violet', label: 'ラベンダー', color: violet.tint },
    { id: 'terracotta', label: 'テラコッタ', color: terracotta.tint },
  ] as const;
  const selectColor = async () => {
    const choice = await pickOne('配色', colors.map((item) => ({
      ...item, selected: item.id === color, icon: { ios: 'circle.fill', android: 'circle' },
    })), { layout: 'divided' });
    const selected = colors.find(({ id }) => id === choice);
    if (selected) setColor(selected.id);
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 7 }}>
        <Text accessibilityRole="header" style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>表示モード</Text>
        <Segmented<ThemePref> value={pref} onChange={setPref} options={[
          { id: 'system', label: '自動' }, { id: 'light', label: 'ライト' }, { id: 'dark', label: 'ダーク' },
        ]} />
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="レイアウト" style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>レイアウト</Text>
        {choices.map((row, index) => (
          <View key={index} style={{ flexDirection: 'row', gap: 8 }}>
            {row.map(({ id, label, detail }) => (
              <StyleOption key={id} id={id} label={label} detail={detail} selected={id === style} onPress={() => {
                if (style !== id) { tick(); setStyle(id); }
              }} />
            ))}
          </View>
        ))}
      </View>
      <Group>
        <Row title="配色" right={colors.find(({ id }) => id === color)?.label}
          icon={{ ios: 'paintpalette', android: 'palette' }} chevron onPress={selectColor} />
      </Group>
    </View>
  );
}
