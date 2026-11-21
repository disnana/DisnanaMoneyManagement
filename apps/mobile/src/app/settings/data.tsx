import { useState } from 'react';
import { Alert, Platform, Text } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { Stack } from 'expo-router';
import { getCurrentMonthKey } from '@dmm/core/utils/format';
import { success } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { useFinanceSubmit } from '@/lib/useFinanceSubmit';
import { usePalette } from '@/lib/theme';
import { DeleteDialog } from '@/ui/DeleteDialog';
import { SettingsSwitchRow } from '@/ui/SettingsSwitchRow';
import { Group, Row, Screen } from '@/ui/kit';

import { LocalFinanceBackup } from '@/ui/LocalFinanceBackup';
import { CsvImport } from '@/ui/CsvImport';

type Mode = 'clear' | 'sample';

const financeBackup = Platform.OS === 'android'
  ? requireOptionalNativeModule<{ isEnabled(): boolean; setEnabled(enabled: boolean): boolean }>('FinanceBackup')
  : null;

export default function DataSettings() {
  const { state, restoreBackup, clearAllData, resetToSampleData, setActiveLedgerId, setMonth, setTransactionFilter } = useFinance();
  const p = usePalette();
  const submit = useFinanceSubmit('stay');
  const [pending, setPending] = useState<Mode>();
  const [message, setMessage] = useState('');
  const [backupEnabled, setBackupEnabled] = useState(() => financeBackup?.isEnabled() ?? false);
  const isSample = pending === 'sample';

  return (
    <>
      <Stack.Screen options={{ title: 'データ管理' }} />
      <Screen>
        <CsvImport />
        <LocalFinanceBackup state={state} restore={async (next) => {
          await restoreBackup(next);
          setActiveLedgerId(null);
          setTransactionFilter('all');
        }} />
        {Platform.OS === 'android' ? (
          <Group>
            {financeBackup ? (
              <SettingsSwitchRow title="家計データの自動バックアップ" checked={backupEnabled}
                subtitle="このアプリと端末のバックアップを両方オンにすると、家計データがAndroidのバックアップ対象に含まれます。"
                onChange={(enabled) => {
                  try {
                    if (!financeBackup.setEnabled(enabled)) throw new Error('Could not save backup preference');
                    setBackupEnabled(enabled);
                  } catch {
                    Alert.alert('設定を保存できませんでした');
                  }
                }} />
            ) : (
              <Row title="家計データの自動バックアップ"
                subtitle="Androidの専用ビルドで利用できます。Expo Goでは切り替えできません。" />
            )}
          </Group>
        ) : null}
        <Group>
          <Row title="サンプルデータに置き換える" icon={{ ios: 'doc.text', android: 'description' }}
            subtitle="今月を基準にした口座・取引・貯金目標で試す" chevron onPress={() => setPending('sample')} />
          <Row title="家計データを初期化" icon={{ ios: 'trash', android: 'delete' }} iconColor={p.danger}
            subtitle="残高0円の現金・銀行口座から始める" chevron onPress={() => setPending('clear')} />
        </Group>
        {message ? <Text accessibilityLiveRegion="polite" style={{ color: p.tint }}>{message}</Text> : null}
      </Screen>
      <DeleteDialog heading={isSample ? 'サンプルデータに置き換えますか？' : '家計データを初期化しますか？'}
        title={pending ? `口座 ${state.accounts.length}件 · 取引 ${state.transactions.length}件` : undefined}
        description="現在の口座・取引・予算・貯金目標などが消えます。この操作は元に戻せません。"
        confirmLabel={isSample ? '置き換える' : '初期化する'} visible={Boolean(pending)}
        onCancel={() => setPending(undefined)} onDelete={async () => {
          if (!pending || !await submit(isSample ? resetToSampleData : clearAllData)) return;
          setActiveLedgerId(null);
          setMonth(getCurrentMonthKey());
          setTransactionFilter('all');
          setPending(undefined);
          setMessage(isSample ? 'サンプルデータに置き換えました。' : '家計データを初期化しました。');
          success();
        }} />
    </>
  );
}
