import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePalette } from '@/lib/theme';
import { useAppearanceStyle, useThemePref, type AppearanceStyle, type ThemePref } from '@/lib/themePref';
import { tick } from '@/lib/haptics';
import { Segmented } from './kit';

const choices = [
  [{ id: 'standard', label: '標準' }, { id: 'classic', label: 'クラシック' }],
  [{ id: 'modern', label: 'モダン' }, { id: 'soft', label: 'やわらか' }],
] as const;

function StyleOption({ id, label, selected, onPress }: {
  id: AppearanceStyle; label: string; selected: boolean; onPress: () => void;
}) {
  const p = usePalette();
  const preview = usePalette(id);

  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} aria-checked={selected} accessibilityLabel={label}
      onPress={onPress} style={({ pressed }) => ({
        flex: 1, padding: 8, gap: 7, borderRadius: p.cardRadius, borderWidth: 1,
        borderColor: selected ? p.tint : p.outline, backgroundColor: pressed || selected ? p.fill : p.card,
      })}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
        style={{ padding: 8, backgroundColor: preview.bg, borderRadius: preview.cardRadius / 2 }}>
        <View style={{ padding: 7, gap: 8, borderRadius: preview.cardRadius / 2,
          backgroundColor: preview.card, borderWidth: 1, borderColor: preview.outline }}>
          <View style={{ width: '57%', height: 5, borderRadius: 3, backgroundColor: preview.textSecondary }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 }}>
            <View style={{ width: '36%', height: 7, borderRadius: 4, backgroundColor: preview.income }} />
            <View style={{ width: '34%', height: 13, borderRadius: Math.min(7, preview.controlRadius / 2), backgroundColor: preview.tint }} />
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, minHeight: 22, paddingHorizontal: 3 }}>
        <Text style={{ color: p.text, flexShrink: 1, fontWeight: '600', fontSize: 14 }}>{label}</Text>
        {selected ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} size={17} tintColor={p.tint} /> : null}
      </View>
    </Pressable>
  );
}

export function AppearanceSettings() {
  const p = usePalette();
  const [pref, setPref] = useThemePref();
  const [style, setStyle] = useAppearanceStyle();

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 7 }}>
        <Text accessibilityRole="header" style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>表示モード</Text>
        <Segmented<ThemePref> value={pref} onChange={setPref} options={[
          { id: 'system', label: '自動' }, { id: 'light', label: 'ライト' }, { id: 'dark', label: 'ダーク' },
        ]} />
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="デザイン"
        style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>デザイン</Text>
        {choices.map((row, index) => (
          <View key={index} style={{ flexDirection: 'row', gap: 8 }}>
            {row.map(({ id, label }) => (
              <StyleOption key={id} id={id} label={label} selected={id === style} onPress={() => {
                if (style !== id) { tick(); setStyle(id); }
              }} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
