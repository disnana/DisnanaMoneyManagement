import { Text } from 'react-native';
import { router } from 'expo-router';
import { getPendingAdvances } from '@dmm/core/utils/advances';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import Constants from 'expo-constants';
import { Group, Row, Screen, Segmented, SectionTitle } from '@/ui/kit';
import { useThemePref, type ThemePref } from '@/lib/themePref';
import { usePalette } from '@/lib/theme';

export default function Settings() {
  const p = usePalette();
  const [pref, setPref] = useThemePref();
  const { state } = useFinance();
  const pendingTotal = getPendingAdvances(state.transactions).reduce((n, t) => n + t.amount, 0);
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

        <SectionTitle>事業・精算</SectionTitle>
        <Group>
          <Row title="カテゴリ" icon={{ ios: 'tag', android: 'label' }} subtitle="名前・アイコン・色を設定"
            onPress={() => router.push('/categories')} chevron />
          <Row
            icon={{ ios: 'folder', android: 'folder' }}
            title="家計グループ"
            subtitle="個人・家庭・事業などを管理"
            onPress={() => router.push('/settings/ledgers')}
            chevron
          />
          <Row
            icon={{ ios: 'arrow.uturn.backward.circle', android: 'undo' }}
            title="立て替え"
            subtitle="あとで回収する支払い"
            right={pendingTotal > 0 ? formatJPY(pendingTotal) : undefined}
            onPress={() => router.push('/settings/advances')}
            chevron
          />
          <Row
            icon={{ ios: 'doc.text', android: 'description' }}
            title="確定申告の準備"
            subtitle="収入・経費・源泉徴収・CSV"
            onPress={() => router.push('/settings/tax')}
            chevron
          />
        </Group>

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
