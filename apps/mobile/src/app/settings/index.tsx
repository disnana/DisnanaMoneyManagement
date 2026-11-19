import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getPendingAdvances } from '@dmm/core/utils/advances';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import Constants from 'expo-constants';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';
import { AppearanceSettings } from '@/ui/AppearanceSettings';
import { usePalette } from '@/lib/theme';
import { getHapticsEnabled, setHapticsEnabled } from '@/lib/haptics';
import { Alert, Linking, Platform } from 'react-native';
import { canAuthenticate, setLockEnabled, useLockEnabled } from '@/lib/appLock';

function openLegalPage(page: 'terms' | 'privacy') {
  void Linking.openURL(`https://dmm.disnana.com/${page}/`).catch(() => Alert.alert('ページを開けませんでした'));
}

export default function Settings() {
  const p = usePalette();
  const [haptics, setHaptics] = useState(getHapticsEnabled);
  const lockOn = useLockEnabled();
  const { state } = useFinance();
  const pendingTotal = getPendingAdvances(state.transactions).reduce((n, t) => n + t.amount, 0);
  return (
    <>
      <Screen>
        <SectionTitle>外観</SectionTitle>
        <AppearanceSettings />

        <SectionTitle>操作</SectionTitle>
        <Group>
          <Pressable accessibilityRole="switch" accessibilityLabel="操作時の振動" accessibilityState={{ checked: haptics }}
            onPress={() => {
              setHapticsEnabled(!haptics);
              setHaptics(!haptics);
            }}
            style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ flex: 1, color: p.text, fontSize: 16, fontWeight: '600' }}>操作時の振動</Text>
            <View style={{ width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center',
              alignItems: haptics ? 'flex-end' : 'flex-start', backgroundColor: haptics ? p.tint : p.fill }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: haptics ? p.onTint : p.card }} />
            </View>
          </Pressable>
          {Platform.OS !== 'web' ? (
            <Pressable accessibilityRole="switch" accessibilityLabel="アプリのロック" accessibilityState={{ checked: lockOn }}
              onPress={async () => {
                if (!lockOn && !(await canAuthenticate())) {
                  Alert.alert('ロックを使えません', 'この端末で顔認証・指紋認証・パスコードのいずれかを設定してください。');
                  return;
                }
                await setLockEnabled(!lockOn);
              }}
              style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>アプリのロック</Text>
                <Text style={{ color: p.textSecondary, fontSize: 13, marginTop: 2 }}>起動時に顔認証・パスコードで開く</Text>
              </View>
              <View style={{ width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center',
                alignItems: lockOn ? 'flex-end' : 'flex-start', backgroundColor: lockOn ? p.tint : p.fill }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: lockOn ? p.onTint : p.card }} />
              </View>
            </Pressable>
          ) : null}
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
