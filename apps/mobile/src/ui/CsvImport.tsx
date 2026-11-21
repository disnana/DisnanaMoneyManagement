import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { MAX_CSV_SIZE } from '@dmm/core/utils/csv';
import { planMonemyImport } from '@dmm/core/utils/monemyImport';
import { BANK_CSV_NAMES, isBankCsvAccount, planBankCsvImport } from '@dmm/core/utils/bankCsvImport';
import { parseImportCsv, type CsvStatement } from '@/lib/csvImport';
import { formatJPY } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { pickOne } from '@/lib/pick';
import { Group, Row } from '@/ui/kit';
import { SettingsSwitchRow } from '@/ui/SettingsSwitchRow';

const PAGE_SIZE = 8;

async function readCsv(asset: DocumentPicker.DocumentPickerAsset): Promise<CsvStatement> {
  const file = Platform.OS === 'web' ? undefined : new File(asset.uri);
  const cachePrefix = file ? Paths.cache.uri.replace(/\/?$/, '/') : undefined;
  try {
    if ((asset.size ?? 0) > MAX_CSV_SIZE || (file?.size ?? 0) > MAX_CSV_SIZE) {
      throw new Error('CSVは2MB以下にしてください。');
    }
    const bytes = asset.file ? new Uint8Array(await asset.file.arrayBuffer()) : await file?.bytes();
    if (!bytes) throw new Error('ファイルを読み込めませんでした。');
    if (bytes.length > MAX_CSV_SIZE) throw new Error('CSVは2MB以下にしてください。');

    return await parseImportCsv(bytes);
  } finally {
    if (Platform.OS === 'web' && asset.file) URL.revokeObjectURL(asset.uri);
    if (file && cachePrefix && file.uri.startsWith(cachePrefix)) {
      try { file.delete(); } catch { /* The OS may have already evicted the cached copy. */ }
    }
  }
}

export function CsvImport() {
  const { state, importMonemyRows, importBankCsvRows } = useFinance();
  const p = usePalette();
  const latest = useRef(state);
  latest.current = state;
  const busy = useRef(false);
  const confirming = useRef(false);
  const [pending, setPending] = useState<CsvStatement & { accountId: string }>();
  const [excluded, setExcluded] = useState(new Set<number>());
  const [page, setPage] = useState(0);
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
      const statement = await readCsv(asset);
      const isMonemy = statement.format === 'monemy';
      const accounts = latest.current.accounts.filter((account) => isMonemy
        ? (!account.currency || account.currency === 'JPY') && account.type !== 'debit'
        : isBankCsvAccount(account));
      if (!accounts.length) throw new Error(isMonemy ? '先に円建ての口座を作成してください。' : '先に円建ての銀行口座を作成してください。');
      const accountId = await pickOne('取り込み先の口座', accounts.map((account) => ({
        id: account.id, label: account.name, subtitle: account.institution,
      })), {
        description: isMonemy
          ? 'CSVには口座情報がありません。全取引をこの口座へ追加します。複数口座が混在する場合は先にファイルを分けてください。'
          : `${BANK_CSV_NAMES[statement.format]}の明細を追加する口座を選んでください。`,
      });
      if (!accountId) { reset(); return; }
      setPage(0);
      setExcluded(new Set());
      setPending({ ...statement, accountId });
    } catch (error) {
      reset();
      setImportError(error instanceof Error ? error.message : 'ファイルを読み込めませんでした。');
    }
  };
  const { preview, previewError } = useMemo(() => {
    if (!pending) return {};
    try {
      return pending.format === 'monemy'
        ? { preview: { format: 'monemy' as const, plan: planMonemyImport(state, pending.rows, pending.accountId) } }
        : { preview: { format: pending.format, plan: planBankCsvImport(state, pending.format, pending.rows, pending.accountId, excluded) } };
    } catch (error) {
      return { previewError: error instanceof Error ? error.message : '口座を確認してください。' };
    }
  }, [pending, state, excluded]);

  const confirm = async () => {
    if (!pending || !busy.current || confirming.current || !preview?.plan.added) return;
    confirming.current = true;
    try {
      if (preview.format === 'monemy') await importMonemyRows(preview.plan);
      else await importBankCsvRows(preview.plan);
      reset();
      setMessage(`${preview.plan.added}件を追加しました。重複${preview.plan.duplicates}件は追加していません。`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '取り込みできません。再確認してください。');
    } finally {
      confirming.current = false;
    }
  };
  const plan = preview?.plan;
  const bankPlan = preview && preview.format !== 'monemy' ? preview.plan : null;
  const pages = pending ? Math.ceil(pending.rows.length / PAGE_SIZE) : 0;

  function includeRow(index: number, include: boolean) {
    if (confirming.current) return;
    setExcluded((current) => {
      const next = new Set(current);
      if (include) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return <Group>
    <Row title="CSVから取り込む" subtitle="Monemy・三井住友銀行・PayPay銀行" chevron onPress={() => void choose()} />
    {pending ? <>
      <Row title={pending.format === 'monemy' ? 'Monemy' : BANK_CSV_NAMES[pending.format]}
        subtitle={`取り込み先  ${state.accounts.find((a) => a.id === pending.accountId)?.name ?? '削除された口座'}`} />
      {plan ? <>
        <Row title={`追加 ${plan.added}件 / 重複 ${plan.duplicates}件${bankPlan ? ` / 除外 ${pending.rows.length - plan.added - plan.duplicates}件` : ''}`}
          subtitle={`収入 ${formatJPY(plan.income)}・支出 ${formatJPY(plan.expense)}${plan.startDate ? `\n${plan.startDate} ～ ${plan.endDate}` : ''}`} />
        {pending.format !== 'monemy' && pending.zeroAmountRows > 0 ? (
          <Row title={`金額が0円の明細 ${pending.zeroAmountRows}件をスキップ`} />
        ) : null}
        {pending.format === 'monemy' ? pending.rows.slice(0, 3).map((row, index) => (
          <Row key={index} title={`${row.date} ${row.title || row.category || 'Monemy取引'}`}
            subtitle={`${row.type === 'income' ? '収入' : '支出'} ${formatJPY(row.amount)} / ${row.category || '未分類'}${row.memo ? `\n${row.memo}` : ''}`} />
        )) : bankPlan ? <>
          <Row title="取り込む明細を確認" subtitle="記録済みの振替やカード引き落としなどは、右側のスイッチをオフにして除外できます。" />
          {pages > 1 ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: page === 0 }} disabled={page === 0}
              onPress={() => setPage(page - 1)} style={{ padding: 12 }}>
              <Text style={{ color: page > 0 ? p.tint : p.textSecondary }}>前の明細</Text>
            </Pressable>
            <Text style={{ color: p.textSecondary }}>{page + 1} / {pages}</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: page + 1 === pages }} disabled={page + 1 === pages}
              onPress={() => setPage(page + 1)} style={{ padding: 12 }}>
              <Text style={{ color: page + 1 < pages ? p.tint : p.textSecondary }}>次の明細</Text>
            </Pressable>
          </View> : null}
          {pending.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row, offset) => {
            const index = page * PAGE_SIZE + offset;
            const title = row.title || '銀行明細';
            const detail = `${row.date} · ${row.type === 'income' ? '入金' : '出金'} ${formatJPY(row.amount)} · 残高 ${formatJPY(row.balance)}`;
            if (bankPlan.duplicateIndexes.has(index)) {
              return <Row key={index} title={title} subtitle={`${detail}\n重複のためスキップ`} />;
            }
            return <SettingsSwitchRow key={index} title={title} subtitle={row.memo ? `${detail}\n${row.memo}` : detail}
              checked={!excluded.has(index)} onChange={(include) => includeRow(index, include)} />;
          })}
        </> : null}
        <Row title="口座・残高の確認" subtitle={pending.format === 'monemy'
          ? '初期残高は変更しません。現在残高を初期残高に設定済みの場合は、履歴追加で二重計上になります。同じ内容でも別口座に取り込むと重複します。CSVにない振替・返金などの意味は推定しません。'
          : '初期残高は変更せず、選択した明細を収入・支出として追加します。現在残高を初期残高に設定済みの場合は、取り込む前に残高を確認してください。'} />
        {plan.added > 0 ? <Row title={`${plan.added}件をこの口座に追加する`} onPress={confirm} /> : null}
      </> : <Row title={previewError ?? 'プレビューを表示できませんでした。'} />}
      <Row title="キャンセル" onPress={() => { if (!confirming.current) reset(); }} />
    </> : null}
    {importError ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive"
      style={{ color: p.danger, padding: 12 }}>{importError}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
  </Group>;
}
