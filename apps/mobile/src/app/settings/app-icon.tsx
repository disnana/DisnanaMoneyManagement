import { useState } from 'react';
import { Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Alert, Pressable, Text, View } from 'react-native';
import { getLauncherIcon, getLauncherIcons, selectLauncherIcon } from '@/lib/launcherIcons';
import { usePalette } from '@/lib/theme';
import { Screen } from '@/ui/kit';

export default function AppIconSettings() {
  const p = usePalette();
  const [icons] = useState(getLauncherIcons);
  const [selected, setSelected] = useState(getLauncherIcon);

  function choose(id: string) {
    if (id === selected) return;
    try {
      selectLauncherIcon(id);
      setSelected(id);
    } catch {
      setSelected(getLauncherIcon());
      Alert.alert('アイコンを変更できませんでした');
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'アプリアイコン' }} />
      <Screen>
        {icons.some(({ nightPreview }) => nightPreview !== undefined) ? (
          <Text style={{ color: p.textSecondary }}>
            自動は端末のダークモードに連動します。ホームアプリによっては表示が切り替わらない場合があります。
          </Text>
        ) : null}
        {icons.length === 0 ? (
          <Text style={{ color: p.textSecondary }}>アプリアイコンの変更には対応するAndroid版が必要です。</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {icons.map(({ id, label, preview, nightPreview }) => {
              const active = selected === id;
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
                  <Text style={{ color: p.text, textAlign: 'center', fontWeight: active ? '700' : '500' }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Screen>
    </>
  );
}
