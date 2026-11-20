import { useRef, useState, type ReactNode } from 'react';
import type { FinanceState } from '@dmm/core/types/finance';
import { parseFinanceBackup } from '@dmm/core/store/financeBackup';
import { InitialFinanceState, useFinanceLoader } from '../hooks/useFinanceStore';
import { ConfirmDialog } from './ConfirmDialog';

export function FinanceGate({ children }: { children: ReactNode }) {
  const { result, retry, restore } = useFinanceLoader();
  const [backup, setBackup] = useState<FinanceState>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  if (result.status === 'ready') {
    return <InitialFinanceState.Provider value={result.state}>{children}</InitialFinanceState.Provider>;
  }
  if (result.status === 'loading') return <main aria-busy="true" className="p-6 text-center">家計データを読み込み中…</main>;

  const confirm = async () => {
    if (!backup || working.current) return false;
    working.current = true;
    setBusy(true);
    try {
      await restore(backup);
      return true;
    } catch {
      setMessage('復元できませんでした。空き容量とアプリのバージョンを確認してください。');
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-bold">家計データを開けませんでした</h1>
      <p>元のデータを保持しています。保存先を確認して再読み込みするか、バックアップから復元してください。</p>
      <button type="button" disabled={busy} onClick={retry} className="min-h-11 rounded-xl bg-teal-700 px-4 font-semibold text-white">再読み込み</button>
      <label className="flex flex-col gap-2">
        バックアップから復元
        <input type="file" disabled={busy} accept=".json,application/json" onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file || working.current) return;
          working.current = true;
          setBusy(true);
          setMessage('');
          try {
            setBackup(parseFinanceBackup(await file.text()));
          } catch {
            setMessage('バックアップを読み取れませんでした。家計データのJSONファイルを選択してください。');
          } finally {
            working.current = false;
            setBusy(false);
          }
        }} />
      </label>
      {message && !backup && <p role="alert">{message}</p>}
      <ConfirmDialog open={!!backup} title="バックアップから復元しますか？"
        description={message || `保存先の家計データを、選んだファイルの口座${backup?.accounts.length}件・取引${backup?.transactions.length}件で置き換えます。`}
        confirmLabel="復元する" onConfirm={confirm} onClose={() => {
          if (!working.current) { setBackup(undefined); setMessage(''); }
        }} />
    </main>
  );
}
