import { useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Alert, Pressable, Text, View } from 'react-native';
import { getLauncherIcon, getLauncherIcons, selectLauncherIcon } from '@/lib/launcherIcons';
import { usePalette } from '@/lib/theme';
import { Group, Screen } from '@/ui/kit';
import { SettingsSwitchRow } from '@/ui/SettingsSwitchRow';

export default function AppIconSettings() {
  const p = usePalette();
  const [icons] = useState(getLauncherIcons);
  const [selected, setSelected] = useState(getLauncherIcon);
  const lastFixedTone = useRef(selected?.endsWith('_teal') ? 'teal' : 'mint');
  const canFollowTheme = icons.some(({ nightPreview }) => nightPreview !== undefined);
  const followsTheme = icons.some(({ id, nightPreview }) => id === selected && nightPreview !== undefined);
  const choices = icons.filter(({ nightPreview }) => (nightPreview !== undefined) === followsTheme);

  function choose(id: string) {
    if (id === selected) return;
    try {
      selectLauncherIcon(id);
      setSelected(id);
      if (id.endsWith('_mint')) lastFixedTone.current = 'mint';
      if (id.endsWith('_teal')) lastFixedTone.current = 'teal';
    } catch {
      setSelected(getLauncherIcon());
      Alert.alert('アイコンを変更できませんでした');
    }
  }

  function changeMode(on: boolean) {
    const family = selected?.replace(/_(auto|mint|teal)$/, '');
    const suffix = on ? '_auto' : '_' + lastFixedTone.current;
    const next = icons.find(({ id }) => id === family + suffix)
      ?? icons.find(({ id }) => id.endsWith(suffix));
    if (next) choose(next.id);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'アプリアイコン' }} />
      <Screen>
        {canFollowTheme ? (
          <Group>
            <SettingsSwitchRow title="端末の明暗に合わせる" checked={followsTheme} onChange={changeMode}
              subtitle={followsTheme
                ? 'ホームアプリによっては色が切り替わらない場合があります。'
                : '好みの絵柄と色を固定します。'} />
          </Group>
        ) : null}
        {icons.length === 0 ? (
          <Text style={{ color: p.textSecondary }}>アプリアイコンの変更には対応するAndroid版が必要です。</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {choices.map(({ id, label, preview, nightPreview }) => {
              const active = selected === id;
              const [name, variant] = label.split('・');
              return (
                <Pressable
                  key={id}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: active }}
                  onPress={() => choose(id)}
                  style={{
                    width: '46%', flexGrow: 1, flexBasis: '46%', maxWidth: '49%',
                    borderColor: active ? p.tint : p.outline, borderWidth: 1, borderRadius: 16,
                    backgroundColor: active ? p.fill : p.card, padding: 12, gap: 8, alignItems: 'center',
                  }}
                >
                  {nightPreview !== undefined ? (
                    <View style={{ height: 58, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Image source={preview} style={{ width: 40, height: 40, borderRadius: 10 }} />
                      <Image source={nightPreview} style={{ width: 40, height: 40, borderRadius: 10 }} />
                    </View>
                  ) : <Image source={preview} style={{ width: 58, height: 58, borderRadius: 13 }} />}
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: p.text, textAlign: 'center', fontWeight: active ? '700' : '500' }}>{name}</Text>
                    {variant && !followsTheme ? (
                      <Text style={{ color: p.textSecondary, fontSize: 13, textAlign: 'center' }}>
                        {variant.replace(/固定$/, '')}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </Screen>
    </>
  );
}
