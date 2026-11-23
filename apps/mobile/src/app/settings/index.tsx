import { useState } from 'react';
import { Alert, Linking, Platform, Text } from 'react-native';
import { router } from 'expo-router';
import { getPendingAdvances } from '@dmm/core/utils/advances';
import { formatJPY } from '@dmm/core/utils/format';
import { useMotionPreference } from '@/lib/motionPref';
import { useFinance } from '@/lib/store';
import Constants from 'expo-constants';
import { Group, Row, Screen, Segmented, SectionTitle } from '@/ui/kit';
import { useThemePref, type ThemePref } from '@/lib/themePref';
import { usePalette } from '@/lib/theme';
import { getLauncherIcons } from '@/lib/launcherIcons';
import { getHapticsEnabled, setHapticsEnabled } from '@/lib/haptics';
import { SettingsSwitchRow } from '@/ui/SettingsSwitchRow';
import { canAuthenticate, setLockEnabled, useLockEnabled } from '@/lib/appLock';

function openLegalPage(page: 'terms' | 'privacy') {
  void Linking.openURL(`https://dmm.disnana.com/${page}/`).catch(() => Alert.alert('ページを開けませんでした'));
}

export default function Settings() {
  const p = usePalette();
  const [pref, setPref] = useThemePref();
  const [reduceMotion, setReduceMotion] = useMotionPreference();
  const [haptics, setHaptics] = useState(getHapticsEnabled);
  const lockOn = useLockEnabled();
  const [launcherIcons] = useState(getLauncherIcons);
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

        {launcherIcons.length > 1 ? (
          <Group>
            <Row title="アプリアイコン" icon={{ ios: 'app', android: 'apps' }} chevron
              onPress={() => router.push('/settings/app-icon')} />
          </Group>
        ) : null}

        <SectionTitle>操作</SectionTitle>
        <Group>
          <SettingsSwitchRow title="モーションを抑える" subtitle={Platform.OS === 'android' ? 'タップや画面切り替えの動きを減らす' : 'タップや画面切り替え、月送りの動きを減らす'}
            checked={reduceMotion} onChange={setReduceMotion} />
          <SettingsSwitchRow title="操作時の振動" checked={haptics} onChange={(enabled) => {
            if (setHapticsEnabled(enabled)) setHaptics(enabled);
          }} />
          {Platform.OS !== 'web' ? (
            <SettingsSwitchRow title="アプリのロック" subtitle="起動時に顔認証・パスコードで開く"
              checked={lockOn} onChange={async (enabled) => {
                if (enabled && !(await canAuthenticate())) {
                  Alert.alert('ロックを使えません', 'この端末で顔認証・指紋認証・パスコードのいずれかを設定してください。');
                  return;
                }
                await setLockEnabled(enabled);
              }} />
          ) : null}
          <Row title="使い方" icon={{ ios: 'questionmark.circle', android: 'help_outline' }}
            subtitle="目的から機能の場所を探す" chevron onPress={() => router.push('/settings/guide')} />
        </Group>

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

        <Group>
          <Row title="データ管理" icon={{ ios: 'externaldrive', android: 'storage' }}
            subtitle="初期化・サンプルデータ" chevron onPress={() => router.push('/settings/data')} />
        </Group>

        <SectionTitle>情報</SectionTitle>
        <Group>
          <Row title="利用規約" chevron onPress={() => openLegalPage('terms')} />
          <Row title="プライバシーポリシー" chevron onPress={() => openLegalPage('privacy')} />
          <Row title="バージョン" right={Constants.expoConfig?.version ?? '-'} />
        </Group>
      </Screen>
    </>
  );
}
