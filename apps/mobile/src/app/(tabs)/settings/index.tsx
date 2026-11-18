import { Text } from 'react-native';
import Constants from 'expo-constants';
import { Group, Row, Screen, Segmented, SectionTitle } from '@/ui/kit';
import { useThemePref, type ThemePref } from '@/lib/themePref';
import { usePalette } from '@/lib/theme';

export default function Settings() {
  const p = usePalette();
  const [pref, setPref] = useThemePref();
  return (
    <>
      <Screen>
        <SectionTitle>外観</SectionTitle>
        <Segmented<ThemePref>
          value={pref}
          onChange={setPref}
          options={[
            { id: 'system', label: '自動' },
            { id: 'light', label: 'ライト' },
            { id: 'dark', label: 'ダーク' },
          ]}
        />
        <Text style={{ color: p.textSecondary, fontSize: 13, paddingHorizontal: 4, marginTop: -8 }}>
          「自動」は端末の設定に合わせます。
        </Text>

        <SectionTitle>アカウント</SectionTitle>
        <Group>
          <Row title="サインイン" right="未設定（この端末のみ）" />
        </Group>
        <Text style={{ color: p.textSecondary, fontSize: 13, paddingHorizontal: 4, marginTop: -8 }}>
          アカウントは任意です。サインインしなくても、データはこの端末に保存されます。
        </Text>

        <SectionTitle>情報</SectionTitle>
        <Group>
          <Row title="バージョン" right={Constants.expoConfig?.version ?? '-'} />
        </Group>
      </Screen>
    </>
  );
}
