import React, { useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet, RotateCcw, Trash2, CheckCircle2 } from 'lucide-react';
import { FinanceState } from '../types/finance';
import { exportTransactionsToCSV } from '../utils/format';
import { saveFile } from '../utils/saveFile';
import { ConfirmDialog } from './ConfirmDialog';
import { ResponsiveSheet } from './ResponsiveSheet';

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

  const handleExportJson = () => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    void saveFile(blob, `dmm-backup-${new Date().toISOString().slice(0, 10)}.json`);
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
      <ResponsiveSheet
        open={open}
        onClose={onClose}
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
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
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
                onClick={handleExportCsv}
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
                onClick={handleExportJson}
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
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
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
                onClick={() => setConfirmMode('sample')}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
              >
                <RotateCcw className="h-4 w-4 text-slate-500" />
                <span>サンプルデータを再読込</span>
              </button>
              <button
                type="button"
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
