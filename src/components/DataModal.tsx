import React, { useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet, RotateCcw, Trash2, X, CheckCircle2 } from 'lucide-react';
import { FinanceState } from '../types/finance';
import { exportTransactionsToCSV } from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';

interface DataModalProps {
  open: boolean;
  state: FinanceState;
  accountNameMap: Record<string, string>;
  onClose: () => void;
  onImportState: (newState: FinanceState) => void;
  onResetToSample: () => void;
  onClearAll: () => void;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [confirmMode, setConfirmMode] = useState<'sample' | 'clear' | null>(null);

  if (!open) return null;

  const handleExportJson = () => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kakeibo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setFeedback({ type: 'success', message: 'JSONバックアップファイルを書き出しました。' });
  };

  const handleExportCsv = () => {
    const sorted = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
    exportTransactionsToCSV(sorted, accountNameMap);
    setFeedback({ type: 'success', message: '全取引データをCSVでダウンロードしました。' });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<FinanceState>;
        if (
          !Array.isArray(parsed.accounts) ||
          !Array.isArray(parsed.transactions) ||
          !Array.isArray(parsed.budgets) ||
          !Array.isArray(parsed.recurringItems) ||
          !Array.isArray(parsed.savingsGoals)
        ) {
          setFeedback({
            type: 'error',
            message: 'バックアップファイルの形式が正しくありません。',
          });
          return;
        }
        onImportState(parsed as FinanceState);
        setFeedback({ type: 'success', message: 'バックアップからデータを復元しました。' });
      } catch {
        setFeedback({
          type: 'error',
          message: 'JSONファイルの読み込みに失敗しました。',
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-modal-title"
      >
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 id="data-modal-title" className="text-base font-semibold text-slate-900">
              データ管理・バックアップ
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-6 p-6">
            <p className="text-sm leading-relaxed text-slate-600">
              家計データはご利用中のブラウザ内に自動保存されます。端末移行や定期バックアップのために、JSONやCSV形式でいつでも書き出し・復元が可能です。
            </p>

            {feedback && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                  feedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{feedback.message}</span>
              </div>
            )}

            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="text-sm font-medium text-slate-900">CSV形式で取引を出力</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Excelやスプレッドシートで開ける形式で出力（全{state.transactions.length}件）
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>CSV出力</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="text-sm font-medium text-slate-900">JSONバックアップを保存</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    口座・予算・固定費・目標を含む全データを保存
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>保存する</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="text-sm font-medium text-slate-900">バックアップから復元</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    保存済みのJSONファイルを読み込んで復元します
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>ファイルを選択</span>
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-5">
              <div className="text-xs font-medium text-slate-500">初期化オプション</div>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmMode('sample')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                  <span>サンプルデータを再読み込み</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmMode('clear')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>全データを消去して空にする</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmMode === 'sample'}
        title="サンプルデータを再読み込みしますか？"
        description="現在保存されている取引や口座データは、初期サンプルデータに置き換わります。"
        confirmLabel="再読み込みする"
        danger={false}
        onConfirm={() => {
          onResetToSample();
          setConfirmMode(null);
          setFeedback({ type: 'success', message: 'サンプルデータを再読み込みしました。' });
        }}
        onCancel={() => setConfirmMode(null)}
      />

      <ConfirmDialog
        open={confirmMode === 'clear'}
        title="すべてのデータを消去しますか？"
        description="取引履歴・予算・貯蓄目標がすべて削除され、空の状態から始められます。必要な場合は事前にJSONバックアップを保存してください。"
        confirmLabel="すべて消去する"
        danger={true}
        onConfirm={() => {
          onClearAll();
          setConfirmMode(null);
          setFeedback({ type: 'success', message: 'すべてのデータを消去しました。' });
        }}
        onCancel={() => setConfirmMode(null)}
      />
    </>
  );
};
