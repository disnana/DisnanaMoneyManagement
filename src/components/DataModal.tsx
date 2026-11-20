import React, { useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet, RotateCcw, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { FinanceState } from '../types/finance';
import { parseFinanceBackup } from '@dmm/core/store/financeBackup';
import { exportTransactionsToCSV } from '../utils/format';
import { saveFile, type SaveFileResult } from '../utils/saveFile';
import { ConfirmDialog } from './ConfirmDialog';
import { usePendingSave } from '../hooks/usePendingSave';
import { ResponsiveSheet } from './ResponsiveSheet';

interface DataModalProps {
  open: boolean;
  state: FinanceState;
  accountNameMap: Record<string, string>;
  onClose: () => void;
  onImportState: (newState: FinanceState) => Promise<boolean>;
  onResetToSample: () => Promise<boolean>;
  onClearAll: () => Promise<boolean>;
}

export const DataModal: React.FC<DataModalProps> = ({
  open,
  state,
  accountNameMap,
  onClose,
  onImportState,
  onResetToSample,
  onClearAll,
}) => {
  const { submit, pending } = usePendingSave(open);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [confirmMode, setConfirmMode] = useState<'sample' | 'clear' | null>(null);

  const exportFile = (format: 'JSON' | 'CSV') => submit(async (isCurrent) => {
    setFeedback(null);
    let result: SaveFileResult;
    try {
      if (format === 'JSON') {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8' });
        result = await saveFile(blob, `dmm-backup-${new Date().toISOString().slice(0, 10)}.json`);
      } else {
        const sorted = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
        result = await exportTransactionsToCSV(sorted, accountNameMap);
      }
    } catch {
      result = 'failed';
    }
    if (!isCurrent() || result === 'cancelled') return false;
    if (result === 'failed') {
      setFeedback({ type: 'error', message: `${format}ファイルを書き出せませんでした。もう一度お試しください。` });
      return false;
    }
    setFeedback({ type: 'success', message: result === 'shared'
      ? `${format}ファイルを共有しました。` : `${format}ファイルのダウンロードを開始しました。` });
    return true;
  });

  const importFile = async (file: File) => {
    setFeedback(null);
    setRetryFile(null);
    const saved = await submit(async (isCurrent) => {
      let next: FinanceState;
      try {
        next = parseFinanceBackup(await file.text());
      } catch {
        if (isCurrent()) setFeedback({ type: 'error', message: 'バックアップファイルの内容を読み取れませんでした。' });
        return false;
      }
      if (!isCurrent()) return false;
      const committed = await onImportState(next);
      if (!committed && isCurrent()) setRetryFile(file);
      return committed;
    });
    if (saved) setFeedback({ type: 'success', message: 'バックアップからデータを復元しました。' });
  };

  return (
    <>
      <ResponsiveSheet
        open={open}
        onClose={() => { setFeedback(null); setRetryFile(null); onClose(); }}
        title="データ管理・バックアップ"
        titleId="data-modal-title"
        maxWidthClass="sm:max-w-lg"
      >
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-slate-600">
            収支データはご利用中のブラウザ内に自動保存されます。端末移行や定期バックアップのために、JSONやCSV形式でいつでも書き出し・復元が可能です。
          </p>

          {feedback && (
            <div
              role={feedback.type === 'error' ? 'alert' : 'status'}
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {feedback.type === 'success'
                ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span>{feedback.message}</span>
            </div>
          )}

          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">CSV形式で取引を出力</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Excelやスプレッドシートで開ける形式で出力（全{state.transactions.length}件）
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => void exportFile('CSV')}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap sm:w-auto sm:shrink-0"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>CSV出力</span>
              </button>
            </div>

            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">JSONバックアップを保存</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  口座・予算・固定費・目標を含む全データを保存
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => void exportFile('JSON')}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap sm:w-auto sm:shrink-0"
              >
                <Download className="h-4 w-4" />
                <span>保存する</span>
              </button>
            </div>

            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">バックアップから復元</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  保存済みのJSONファイルを読み込んで復元します
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                disabled={pending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void importFile(file);
                }}
                className="hidden"
              />
              {retryFile && (
                <button type="button" disabled={pending} onClick={() => void importFile(retryFile)}
                  className="min-h-[44px] rounded-xl border border-teal-700 px-3 text-sm font-semibold text-teal-800">
                  復元を再試行
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap sm:w-auto sm:shrink-0"
              >
                <Upload className="h-4 w-4" />
                <span>ファイルを選択</span>
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="text-xs font-medium text-slate-500">初期化オプション</div>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmMode('sample')}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
              >
                <RotateCcw className="h-4 w-4 text-slate-500" />
                <span>サンプルデータを再読込</span>
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmMode('clear')}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 active:scale-[0.98] whitespace-nowrap"
              >
                <Trash2 className="h-4 w-4" />
                <span>全データを消去</span>
              </button>
            </div>
          </div>
        </div>
      </ResponsiveSheet>

      <ConfirmDialog
        open={confirmMode === 'sample'}
        title="サンプルデータを再読み込みしますか？"
        description="現在保存されている取引や口座データは、初期サンプルデータに置き換わります。"
        confirmLabel="再読み込みする"
        danger={false}
        onConfirm={onResetToSample}
        onSaved={() => {
          setRetryFile(null);
          setFeedback({ type: 'success', message: 'サンプルデータを再読み込みしました。' });
        }}
        onClose={() => setConfirmMode(null)}
      />

      <ConfirmDialog
        open={confirmMode === 'clear'}
        title="すべてのデータを消去しますか？"
        description="取引履歴・予算・貯蓄目標がすべて削除され、空の状態から始められます。必要な場合は事前にJSONバックアップを保存してください。"
        confirmLabel="すべて消去する"
        danger={true}
        onConfirm={onClearAll}
        onSaved={() => {
          setRetryFile(null);
          setFeedback({ type: 'success', message: 'すべてのデータを消去しました。' });
        }}
        onClose={() => setConfirmMode(null)}
      />
    </>
  );
};
