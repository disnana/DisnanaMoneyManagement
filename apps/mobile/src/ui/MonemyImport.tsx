import { useMemo, useRef, useState } from 'react';
import { Platform, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { MAX_MONEMY_CHARS, parseMonemyCsv, planMonemyImport, type MonemyRow } from '@dmm/core/utils/monemyImport';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { pickOne } from '@/lib/pick';
import { Group, Row } from '@/ui/kit';

function digest(text: string): string {
  // UTF-16LE makes the source fingerprint stable across JS runtimes.
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const codeUnit = text.charCodeAt(i);
    bytes[i * 2] = codeUnit & 0xff;
    bytes[i * 2 + 1] = codeUnit >> 8;
  }
  return bytesToHex(sha256(bytes));
}

async function readCsv(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  const file = Platform.OS === 'web' ? undefined : new File(asset.uri);
  const cachePrefix = file ? Paths.cache.uri.replace(/\/?$/, '/') : undefined;
  try {
    if ((asset.size ?? 0) > MAX_MONEMY_CHARS || (file?.size ?? 0) > MAX_MONEMY_CHARS) {
      throw new Error('CSVは2MB以下にしてください。');
    }
    if (asset.file) return await asset.file.text();
    if (file) return await file.text();
    throw new Error('ファイルを読み込めませんでした。');
  } finally {
    if (Platform.OS === 'web' && asset.file) URL.revokeObjectURL(asset.uri);
    if (file && cachePrefix && file.uri.startsWith(cachePrefix)) {
      try { file.delete(); } catch { /* The OS may have already evicted the cached copy. */ }
    }
  }
}

export function MonemyImport() {
  const { state, importMonemyRows } = useFinance();
  const p = usePalette();
  const latest = useRef(state);
  latest.current = state;
  const busy = useRef(false);
  const confirming = useRef(false);
  const [pending, setPending] = useState<{ rows: MonemyRow[]; accountId: string }>();
  const [message, setMessage] = useState('');
  const [importError, setImportError] = useState('');
  const reset = () => { setPending(undefined); setImportError(''); busy.current = false; };
  const choose = async () => {
    if (busy.current) return;
    busy.current = true;
    setMessage('');
    setImportError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/csv'],
        copyToCacheDirectory: true, multiple: false, base64: false,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) { reset(); return; }
      const rows = parseMonemyCsv(await readCsv(asset), digest);
      const accounts = latest.current.accounts.filter(a => (!a.currency || a.currency === 'JPY') && a.type !== 'debit');
      if (!accounts.length) throw new Error('先に円建ての口座を作成してください。');
      const accountId = await pickOne('取り込み先の口座', accounts.map(a => ({ id: a.id, label: a.name })), {
        description: 'CSVには口座情報がありません。全取引をこの口座へ追加します。複数口座が混在する場合は先にファイルを分けてください。',
      });
      if (!accountId) { reset(); return; }
      setPending({ rows, accountId });
    } catch (error) {
      reset();
      setImportError(error instanceof Error ? error.message : 'ファイルを読み込めませんでした。');
    }
  };
  const { preview, previewError } = useMemo(() => {
    if (!pending) return {};
    try {
      return { preview: planMonemyImport(state, pending.rows, pending.accountId) };
    } catch (error) {
      return { previewError: error instanceof Error ? error.message : '口座を確認してください。' };
    }
  }, [pending, state]);

  const confirm = () => {
    if (!pending || !busy.current || confirming.current || !preview?.added) return;
    confirming.current = true;
    try {
      importMonemyRows(preview);
      reset();
      setMessage(`${preview.added}件を追加しました。重複${preview.duplicates}件は追加していません。`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '取り込みできません。再確認してください。');
    } finally {
      confirming.current = false;
    }
  };
  return <Group>
    <Row title="Monemy CSVから取り込む" subtitle="既存データを残して追加。UTF-8・整数円の収入と支出に対応" chevron onPress={() => void choose()} />
    {pending ? <>
      <Row title={`取り込み先: ${state.accounts.find(a => a.id === pending.accountId)?.name ?? '削除された口座'}`} />
      {preview ? <>
        <Row title={`追加 ${preview.added}件 / 取り込み済み ${preview.duplicates}件`}
          subtitle={`収入 ${preview.income.toLocaleString()}円・支出 ${preview.expense.toLocaleString()}円\n期間 ${preview.startDate} ～ ${preview.endDate}`} />
        {pending.rows.slice(0, 3).map((r, i) => <Row key={i} title={`${r.date} ${r.title || r.category || 'Monemy取引'}`}
          subtitle={`${r.type === 'income' ? '収入' : '支出'} ${r.amount.toLocaleString()}円 / ${r.category || '未分類'}${r.memo ? `\n${r.memo}` : ''}`} />)}
        <Row title="口座・残高の確認" subtitle="初期残高は変更しません。現在残高を初期残高に設定済みの場合は、履歴追加で二重計上になります。同じ内容でも別口座に取り込むと重複します。CSVにない振替・返金などの意味は推定しません。" />
        {preview.added > 0 ? <Row title={`${preview.added}件をこの口座に追加する`} onPress={confirm} /> : null}
      </> : <Text>{previewError}</Text>}
      <Row title="キャンセル" onPress={reset} />
    </> : null}
    {importError ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive"
      style={{ color: p.danger, padding: 12 }}>{importError}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
  </Group>;
}
