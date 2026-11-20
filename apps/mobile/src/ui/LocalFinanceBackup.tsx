import { useRef, useState } from 'react';
import { Platform, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { FinanceState } from '@dmm/core/types/finance';
import { parseFinanceBackup, serializeFinanceBackup } from '@dmm/core/store/financeBackup';
import { usePalette } from '@/lib/theme';
import { DeleteDialog } from './DeleteDialog';
import { Group, Row } from './kit';

/** Also usable from the recovery screen, before there is a ledger to export. */
export function LocalFinanceBackup({ state, restore }: { state?: FinanceState; restore: (state: FinanceState) => Promise<void> }) {
  const p = usePalette();
  const busy = useRef(false);
  const [backup, setBackup] = useState<FinanceState>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const perform = async (operation: () => Promise<void>, failure: string) => {
    if (busy.current) return;
    busy.current = true;
    setMessage('');
    setError('');
    try {
      await operation();
    } catch {
      setError(failure);
    } finally {
      busy.current = false;
    }
  };

  const choose = () => perform(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain'], multiple: false, copyToCacheDirectory: true, base64: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.file) {
      try { setBackup(parseFinanceBackup(await asset.file.text())); }
      finally { URL.revokeObjectURL(asset.uri); }
    } else {
      const file = new File(asset.uri);
      try { setBackup(parseFinanceBackup(await file.text())); }
      finally {
        if (file.uri.startsWith(Paths.cache.uri.replace(/\/?$/, '/'))) {
          try { file.delete(); } catch { /* Already evicted from the document-picker cache. */ }
        }
      }
    }
  }, 'バックアップを読み取れませんでした。家計データのJSONファイルを選択してください。');

  const exportFile = () => perform(async () => {
    if (!state || !await Sharing.isAvailableAsync()) throw new Error();
    const file = new File(Paths.cache, `dmm-backup-${Date.now()}.json`);
    let shared = false;
    try {
      file.create();
      file.write(serializeFinanceBackup(state));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: '家計データのバックアップ' });
      shared = true;
    } finally {
      // Android's receiving app can still be reading the shared URI after the chooser returns.
      if (!shared || Platform.OS === 'ios') {
        try { file.delete(); } catch { /* The temporary file may already be gone. */ }
      }
    }
  }, 'バックアップを共有できませんでした。空き容量と共有先を確認してください。');

  return <>
    <Group>
      {state && Platform.OS !== 'web' ? <Row title="バックアップを書き出す" subtitle="口座・取引・予算などをJSONファイルに保存"
        icon={{ ios: 'square.and.arrow.up', android: 'upload_file' }} chevron onPress={exportFile} /> : null}
      <Row title="バックアップから復元" subtitle="家計データのJSONファイルを選択"
        icon={{ ios: 'square.and.arrow.down', android: 'file_download' }} chevron onPress={choose} />
    </Group>
    {error && !backup ? <Text accessibilityRole="alert" style={{ color: p.danger }}>{error}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={{ color: p.text }}>{message}</Text> : null}
    <DeleteDialog visible={!!backup} heading="バックアップから復元しますか？"
      title={backup ? `口座 ${backup.accounts.length}件 · 取引 ${backup.transactions.length}件` : undefined}
      description={error || '保存先の家計データを、選んだファイルの内容で置き換えます。'}
      confirmLabel="復元する" onCancel={() => { if (!busy.current) { setBackup(undefined); setError(''); } }}
      onDelete={() => backup && perform(async () => {
        await restore(backup);
        setBackup(undefined);
        setMessage('バックアップから復元しました。');
      }, '復元できませんでした。空き容量とアプリのバージョンを確認し、再試行してください。')} />
  </>;
}
