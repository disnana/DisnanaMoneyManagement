import { useCallback } from 'react';
import { Image, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { accountAvailable, refreshAndroidAccount, signInAndroidAccount, signOutAndroidAccount, useAndroidAccount } from '@/lib/androidAccount';
import { usePalette } from '@/lib/theme';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';

const mascot = require('../../../assets/launcher-icons/smile_mint.png');
const activityLabels = { grant: '付与', spend: '消費', reverse: '返金に伴う調整' };

export default function AccountSettings() {
  const p = usePalette();
  const { signedIn, accountId, credits, history, busy, message } = useAndroidAccount();
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
              <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 3 }}>
                <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>アカウントID</Text>
                <Text selectable={accountId !== null} style={{ color: p.textSecondary, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                  {accountId ?? (busy ? '取得中…' : '取得できません')}
                </Text>
                {accountId ? <Text style={{ color: p.textSecondary, fontSize: 13 }}>お問い合わせ用。長押しでコピーできます。</Text> : null}
              </View>
              <Row title="アカウント情報を再読み込み" onPress={busy ? undefined : refreshAndroidAccount} />
            </Group>
            <SectionTitle>AIレシート</SectionTitle>
            <Group>
              <Row title="クレジット残高" icon={{ ios: 'wallet.pass', android: 'account_balance_wallet' }}
                right={credits === null ? (busy ? '取得中…' : '取得できません') : `${credits.toLocaleString('ja-JP')} クレジット`} />
            </Group>
            <Text style={{ color: p.textSecondary }}>
              販売時は、公式サイトで購入したクレジットが同じGoogleアカウントの残高に反映されます。
            </Text>
            <SectionTitle>クレジット履歴</SectionTitle>
            <Group>
              {history?.length ? history.map(item => (
                <Row key={item.id} title={activityLabels[item.operation.kind]}
                  subtitle={new Date(item.at_ms).toLocaleString('ja-JP')}
                  right={`${item.operation.kind === 'grant' ? '+' : '−'}${item.operation.amount.toLocaleString('ja-JP')}`} />
              )) : <Row title={busy ? '取得中…' : history === null ? '履歴を表示できません' : '利用履歴はありません'} />}
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
