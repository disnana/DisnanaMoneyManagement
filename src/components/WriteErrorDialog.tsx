import { useEffect, useRef } from 'react';
import { pushLayer } from '../utils/navHistory';

export function WriteErrorDialog({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const release = pushLayer(onDismiss);
    return () => {
      element.close();
      release();
    };
  }, [onDismiss]);

  return (
    <dialog ref={dialog} role="alertdialog" aria-labelledby="storage-error-title" aria-describedby="storage-error-detail"
      onCancel={(event) => { event.preventDefault(); onDismiss(); }}
      onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}
      className="fixed inset-0 m-auto w-[min(90vw,24rem)] rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-black/40">
      <h2 id="storage-error-title" className="font-semibold">家計データの保存</h2>
      <p id="storage-error-detail" className="mt-2 text-sm leading-relaxed text-slate-600">{message}</p>
      <div className="mt-4 flex justify-end">
        <button type="button" autoFocus onClick={onDismiss}
          className="min-h-[44px] rounded-xl border border-slate-200 px-4 text-sm font-semibold">閉じる</button>
      </div>
    </dialog>
  );
}
