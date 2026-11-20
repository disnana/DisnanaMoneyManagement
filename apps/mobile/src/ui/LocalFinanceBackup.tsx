import { useRef, useState } from 'react';
import { Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { FinanceState } from '@dmm/core/types/finance';
import { parseFinanceBackup, serializeFinanceBackup } from '@dmm/core/store/financeBackup';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { DeleteDialog } from '@/ui/DeleteDialog';
import { Group, Row } from '@/ui/kit';

export function LocalFinanceBackup() {
  const { state, restoreBackup, setActiveLedgerId, setTransactionFilter } = useFinance();
  const p = usePalette();
  const busy = useRef(false);
  const [pending, setPending] = useState<FinanceState>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const run = async (action: () => Promise<void>) => {
    if (busy.current || pending) return;
    busy.current = true;
    setMessage('');
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'バックアップを処理できませんでした。');
    } finally {
      busy.current = false;
    }
  };

  const exportFile = () => run(async () => {
    if (!await Sharing.isAvailableAsync()) throw new Error('この端末ではファイルの共有ができません。');
    const file = new File(Paths.cache, `dmm-backup-${Date.now()}.json`);
    file.create();
    try {
      file.write(serializeFinanceBackup(state));
    } catch (cause) {
      try { file.delete(); } catch { /* The write may have already failed before creating data. */ }
      throw cause;
    }
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: '家計データのバックアップ' });
  });

  const selectFile = () => run(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const file = new File(asset.uri);
    try {
      setPending(parseFinanceBackup(await file.text()));
    } finally {
      if (file.uri.startsWith(Paths.cache.uri.replace(/\/?$/, '/'))) {
        try { file.delete(); } catch { /* The cache copy may already have disappeared. */ }
      }
    }
  });

  return (
    <>
      <Group>
        <Row title="バックアップを書き出す" subtitle="口座・取引・予算など、家計データ全体をファイルに保存" chevron
          icon={{ ios: 'square.and.arrow.up', android: 'upload_file' }} onPress={() => void exportFile()} />
        <Row title="バックアップから復元" subtitle="現在の家計データをファイルの内容で置き換える" chevron
          icon={{ ios: 'square.and.arrow.down', android: 'file_download' }} onPress={() => void selectFile()} />
        <Text style={{ color: p.textSecondary, paddingHorizontal: 14, paddingVertical: 8, fontSize: 12 }}>
          バックアップファイルには取引内容や口座名が含まれます。
        </Text>
      </Group>
      {error ? <Text accessibilityRole="alert" style={{ color: p.danger }}>{error}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={{ color: p.tint }}>{message}</Text> : null}
      <DeleteDialog visible={!!pending} heading="バックアップから復元しますか？"
        title={pending ? `口座 ${pending.accounts.length}件 · 取引 ${pending.transactions.length}件` : undefined}
        description={error || '現在の家計データが置き換わります。'}
        confirmLabel="復元する" onCancel={() => setPending(undefined)} onDelete={() => {
          if (!pending || busy.current) return;
          busy.current = true;
          try {
            restoreBackup(pending);
            setActiveLedgerId(null);
            setTransactionFilter('all');
            setMessage('バックアップから復元しました。');
            setPending(undefined);
          } catch {
            setError('復元データを保存できませんでした。空き容量を確認し、再試行してください。');
          } finally {
            busy.current = false;
          }
        }} />
    </>
  );
}
