import { useCallback } from 'react';
import { Image, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { accountAvailable, refreshAndroidAccount, signInAndroidAccount, signOutAndroidAccount, useAndroidAccount } from '@/lib/androidAccount';
import { usePalette } from '@/lib/theme';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';

const mascot = require('../../../assets/launcher-icons/smile_mint.png');

export default function AccountSettings() {
  const p = usePalette();
  const { signedIn, credits, busy, message } = useAndroidAccount();
  useFocusEffect(useCallback(() => {
    void refreshAndroidAccount();
  }, []));

  return (
    <>
      <Stack.Screen options={{ title: 'アカウント' }} />
      <Screen>
        {!accountAvailable ? (
          <Text style={{ color: p.textSecondary }}>
            Googleログインは、認証先を設定したAndroidのテストビルドで使えます。
          </Text>
        ) : signedIn ? (
          <>
            <Group>
              <Row title="Googleアカウント" right="ログイン済み" icon={{ ios: 'person.crop.circle', android: 'account_circle' }} />
            </Group>
            <SectionTitle>AIレシート</SectionTitle>
            <Group>
              <Row title="クレジット残高" icon={{ ios: 'wallet.pass', android: 'account_balance_wallet' }}
                right={busy ? '取得中…' : credits === null ? '取得できません' : `${credits.toLocaleString('ja-JP')} クレジット`} />
              <Row title="残高を再読み込み" onPress={busy ? undefined : refreshAndroidAccount} />
            </Group>
            <Group>
              <Row title="ログアウト" onPress={busy ? undefined : signOutAndroidAccount} />
            </Group>
          </>
        ) : (
          <>
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
              <Image source={mascot} style={{ width: 76, height: 76, borderRadius: 20 }} />
              <Text accessibilityRole="header" style={{ color: p.text, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>
                マネーちゃんにログイン
              </Text>
              <Text style={{ color: p.textSecondary, textAlign: 'center' }}>GoogleアカウントでAIレシート用のクレジットを確認できます。</Text>
            </View>
            <Group>
              <Row title={busy ? '処理中…' : 'Google で続ける'} chevron={!busy} onPress={busy ? undefined : signInAndroidAccount} />
            </Group>
            <Text style={{ color: p.textSecondary }}>手入力の家計簿はログインせずに使えます。</Text>
          </>
        )}
        {message ? <Text accessibilityLiveRegion="polite" style={{ color: p.textSecondary }}>{message}</Text> : null}
      </Screen>
    </>
  );
}
