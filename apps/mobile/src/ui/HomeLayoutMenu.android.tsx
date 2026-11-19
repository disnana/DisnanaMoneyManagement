import { useState } from 'react';
import { DropdownMenu, Host, RNHostView, SelectableDropdownMenuItem, Text } from '@expo/ui/jetpack-compose';
import { homeLayouts, useHomeLayout } from '@/lib/homePreferences';
import { usePalette } from '@/lib/theme';
import { useThemeColorScheme } from '@/lib/themePref';
import { HeaderAction } from './HeaderAction';

export function HomeLayoutMenu() {
  const p = usePalette();
  const scheme = useThemeColorScheme();
  const [layout, setLayout] = useHomeLayout();
  const [expanded, setExpanded] = useState(false);

  return (
    <Host style={{ width: 44, height: 44 }} colorScheme={scheme} seedColor={p.tint}>
      <DropdownMenu expanded={expanded} onDismissRequest={() => setExpanded(false)}>
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <HeaderAction name={{ ios: 'rectangle.3.group', android: 'dashboard_customize' }} label="ホームのレイアウト"
              circular inContent onPress={() => setExpanded(true)} />
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {homeLayouts.map(({ id, label }) => (
            <SelectableDropdownMenuItem key={id} selected={id === layout}
              onClick={() => { setLayout(id); setExpanded(false); }}>
              <SelectableDropdownMenuItem.Text><Text>{label}</Text></SelectableDropdownMenuItem.Text>
            </SelectableDropdownMenuItem>
          ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}
