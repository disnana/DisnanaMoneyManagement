import { useRef, useState } from 'react';
import { Alert, Platform, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { appendMonemyRows, MAX_MONEMY_CHARS, parseMonemyCsv, type MonemyRow } from '@dmm/core/utils/monemyImport';
import { useFinance } from '@/lib/store';
import { pickOne } from '@/lib/pick';
import { Group, Row } from '@/ui/kit';

export function MonemyImport() {
  const { state, importMonemyRows } = useFinance();
  const latest = useRef(state);
  latest.current = state;
  const busy = useRef(false);
  const [pending, setPending] = useState<{ rows: MonemyRow[]; accountId: string }>();
  const [message, setMessage] = useState('');
  const reset = () => { setPending(undefined); busy.current = false; };
  const choose = async () => {
    if (busy.current) return;
    busy.current = true;
    setMessage('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/csv'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) { reset(); return; }
      const asset = result.assets[0];
      if (asset.size !== undefined && asset.size > MAX_MONEMY_CHARS) throw new Error('CSVは2MB以下にしてください。');
      const file = Platform.OS === 'web' ? undefined : new File(asset.uri);
      if (file && file.size > MAX_MONEMY_CHARS) throw new Error('CSVは2MB以下にしてください。');
      const text = asset.file ? await asset.file.text() : await file!.text();
      const rows = parseMonemyCsv(text);
      const accounts = latest.current.accounts.filter(a => (!a.currency || a.currency === 'JPY') && a.type !== 'debit');
      if (!accounts.length) throw new Error('先に円建ての口座を作成してください。');
      const accountId = await pickOne('取り込み先の口座', accounts.map(a => ({ id: a.id, label: a.name })), {
        description: 'CSVには口座情報がありません。全取引をこの口座へ追加します。複数口座が混在する場合は先にファイルを分けてください。',
      });
      if (!accountId) { reset(); return; }
      appendMonemyRows(latest.current, rows, accountId); // validate before preview
      setPending({ rows, accountId });
    } catch (e) { reset(); Alert.alert('取り込みできません', e instanceof Error ? e.message : 'ファイルを読み込めませんでした。'); }
  };
  let preview: ReturnType<typeof appendMonemyRows> | undefined;
  let previewError = '';
  if (pending) {
    try { preview = appendMonemyRows(state, pending.rows, pending.accountId); }
    catch (e) { previewError = e instanceof Error ? e.message : '口座を確認してください。'; }
  }
  const confirm = () => {
    if (!pending || !preview || !preview.added) return;
    // Close preview immediately to prevent double taps. Store also rechecks duplicates atomically.
    const { rows, accountId } = pending;
    setPending(undefined);
    try {
      const current = appendMonemyRows(latest.current, rows, accountId);
      importMonemyRows(rows, accountId);
      setMessage(`${current.added}件を追加しました。重複${current.duplicates}件は追加していません。`);
    } catch (e) { Alert.alert('取り込みできません', e instanceof Error ? e.message : '再確認してください。'); }
    finally { busy.current = false; }
  };
  return <Group>
    <Row title="Monemy CSVから取り込む" subtitle="既存データを残して追加。UTF-8・整数円の収入と支出に対応" chevron onPress={() => void choose()} />
    {pending ? <>
      <Row title={`取り込み先: ${state.accounts.find(a => a.id === pending.accountId)?.name ?? '削除された口座'}`} />
      {preview ? <>
        <Row title={`追加 ${preview.added}件 / 取り込み済み ${preview.duplicates}件`}
          subtitle={`収入 ${preview.income.toLocaleString()}円・支出 ${preview.expense.toLocaleString()}円\n期間 ${pending.rows.map(r => r.date).sort()[0]} ～ ${pending.rows.map(r => r.date).sort().at(-1)}`} />
        {pending.rows.slice(0, 3).map((r, i) => <Row key={i} title={`${r.date} ${r.title || r.category || 'Monemy取引'}`}
          subtitle={`${r.type === 'income' ? '収入' : '支出'} ${r.amount.toLocaleString()}円 / ${r.category || '未分類'}${r.memo ? `\n${r.memo}` : ''}`} />)}
        <Row title="口座・残高の確認" subtitle="初期残高は変更しません。現在残高を初期残高に設定済みの場合は、履歴追加で二重計上になります。同じ内容でも別口座に取り込むと重複します。CSVにない振替・返金などの意味は推定しません。" />
        {preview.added > 0 ? <Row title={`${preview.added}件をこの口座に追加する`} onPress={confirm} /> : null}
      </> : <Text>{previewError}</Text>}
      <Row title="キャンセル" onPress={reset} />
    </> : null}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
  </Group>;
}
