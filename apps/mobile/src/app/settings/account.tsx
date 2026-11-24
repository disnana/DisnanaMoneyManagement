import { useCallback } from 'react';
import { Image, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { accountAvailable, refreshAndroidAccount, signInAndroidAccount, signOutAndroidAccount, useAndroidAccount, type CreditLot } from '@/lib/androidAccount';
import { usePalette } from '@/lib/theme';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';

const mascot = require('../../../assets/launcher-icons/smile_mint.png');
const activityLabels = { grant: '付与', spend: '消費', reverse: '返金に伴う調整', expire: '有効期限切れ' };

const expiryFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Asia/Tokyo',
});

function groupByExpiry(lots: readonly CreditLot[]) {
  const groups = new Map<number, number>();
  for (const lot of lots) {
    const expires = lot.expires_at_ms ?? 0;
    groups.set(expires, (groups.get(expires) ?? 0) + lot.amount);
  }
  return [...groups].sort(([left], [right]) => (left || Infinity) - (right || Infinity));
}

function SupportIdentifier({ label, value, busy }: { label: string; value: string | null; busy: boolean }) {
  const p = usePalette();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 3 }}>
      <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
      <Text selectable={value !== null} style={{ color: p.textSecondary, fontSize: 14, fontVariant: ['tabular-nums'] }}>
        {value ?? (busy ? '取得中…' : '取得できません')}
      </Text>
    </View>
  );
}

function ExpiryRows({ lots, expired }: { lots: readonly CreditLot[]; expired?: boolean }) {
  return groupByExpiry(lots).map(([expires, amount]) => (
    <Row key={expires} compact title={expires === 0 ? '有効期限なし' : expiryFormatter.format(expires)}
      subtitle={expires === 0 ? undefined : expired ? '期限切れ · 日本時間' : '有効期限 · 日本時間'}
      right={`${amount.toLocaleString('ja-JP')} CR`} />
  ));
}

export default function AccountSettings() {
  const p = usePalette();
  const { signedIn, accountId, issuerNodeID, credits, lots, expiredLots, history, busy, message } = useAndroidAccount();
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
              <SupportIdentifier label="アカウントID" value={accountId} busy={busy} />
              <SupportIdentifier label="担当ノード" value={issuerNodeID} busy={busy} />
              {accountId || issuerNodeID ? <Text style={{ paddingHorizontal: 16, paddingBottom: 10, color: p.textSecondary, fontSize: 13 }}>
                お問い合わせ用。IDと担当ノードは長押しでコピーできます。
              </Text> : null}
              <Row title="アカウント情報を再読み込み" onPress={busy ? undefined : refreshAndroidAccount} />
            </Group>
            <SectionTitle>AIレシート</SectionTitle>
            <Group>
              <Row title="クレジット残高" icon={{ ios: 'wallet.pass', android: 'account_balance_wallet' }}
                right={credits === null ? (busy ? '取得中…' : '取得できません') : `${credits.toLocaleString('ja-JP')} CR`} />
            </Group>
            {credits !== null && credits > 0 ? <>
              <SectionTitle>利用可能なCRの有効期限</SectionTitle>
              <Group>{lots?.length ? <ExpiryRows lots={lots} /> : <Row compact title="有効期限を表示できません" />}</Group>
            </> : null}
            {expiredLots?.length ? <>
              <SectionTitle>有効期限が切れたCR</SectionTitle>
              <Group><ExpiryRows lots={expiredLots} expired /></Group>
            </> : null}
            <Text style={{ color: p.textSecondary }}>
              販売時は、公式サイトで購入したクレジットが同じGoogleアカウントの残高に反映されます。
            </Text>
            <SectionTitle>クレジット履歴</SectionTitle>
            <Group>
              {history?.length ? history.map(item => {
                const { kind, amount, expired_lots } = item.operation;
                const deadlines = kind === 'expire' && expired_lots ? groupByExpiry(expired_lots) : [];
                return (
                  <View key={item.id}>
                    <Row title={activityLabels[kind]} subtitle={new Date(item.at_ms).toLocaleString('ja-JP')}
                      right={`${kind === 'grant' ? '+' : '−'}${amount.toLocaleString('ja-JP')}`} />
                    {deadlines.length ? <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 4 }}>
                      <Text style={{ color: p.textSecondary, fontSize: 13 }}>有効期限の内訳（日本時間）</Text>
                      {deadlines.map(([expires, expired]) => <Text key={expires}
                        style={{ color: p.textSecondary, fontSize: 13 }}>
                        {expiryFormatter.format(expires)} · {expired.toLocaleString('ja-JP')} CR
                      </Text>)}
                    </View> : null}
                  </View>
                );
              }) : <Row title={busy ? '取得中…' : history === null ? '履歴を表示できません' : '利用履歴はありません'} />}
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
