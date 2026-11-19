import { Host, Image, Menu, Picker, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, background, clipShape, frame, menuIndicator, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { homeLayouts, useHomeLayout, type HomeLayout } from '@/lib/homePreferences';
import { usePalette } from '@/lib/theme';
import { useThemeColorScheme } from '@/lib/themePref';

export function HomeLayoutMenu() {
  const p = usePalette();
  const scheme = useThemeColorScheme();
  const [layout, setLayout] = useHomeLayout();

  return (
    <Host style={{ width: 44, height: 44 }} alignment="center" colorScheme={scheme} seedColor={p.tint}>
      <Menu modifiers={[accessibilityLabel('ホームのレイアウト'), menuIndicator('hidden')]}
        label={<Image systemName="rectangle.3.group" size={22} color={p.tint}
          modifiers={[frame({ width: 44, height: 44 }), background(p.fill), clipShape('circle')]} />}>
        <Picker<HomeLayout> selection={layout} onSelectionChange={setLayout} modifiers={[pickerStyle('inline')]}>
          {homeLayouts.map(({ id, label }) => (
            <Text key={id} modifiers={[tag(id)]}>{label}</Text>
          ))}
        </Picker>
      </Menu>
    </Host>
  );
}
