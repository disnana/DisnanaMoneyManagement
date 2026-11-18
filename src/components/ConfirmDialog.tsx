import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { pushLayer } from '../utils/navHistory';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  onSecondaryConfirm?: () => void;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = '削除する',
  cancelLabel = 'キャンセル',
  secondaryLabel,
  onSecondaryConfirm,
  danger = true,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    if (!open) return;
    return pushLayer(() => cancelRef.current());
  }, [open]);

  const dialogTree = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onCancel();
          }}
          className="fixed inset-x-0 top-[var(--vvt,0px)] z-[60] flex h-[var(--vvh,100%)] items-end justify-center bg-slate-900/40 pb-safe sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="w-full rounded-t-3xl border border-slate-200 bg-white p-5 pb-safe shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
          >
            <div className="mb-3 flex justify-center sm:hidden" aria-hidden="true">
              <span className="h-1.5 w-10 rounded-full bg-slate-300" />
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    danger ? 'bg-red-50 text-red-600' : 'bg-teal-50 text-teal-700'
                  }`}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 active:scale-95"
                aria-label="閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2.5">
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[44px] whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98]"
              >
                {cancelLabel}
              </button>
              {secondaryLabel && onSecondaryConfirm && (
                <button
                  type="button"
                  onClick={onSecondaryConfirm}
                  className="min-h-[44px] whitespace-nowrap rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 active:scale-[0.98]"
                >
                  {secondaryLabel}
                </button>
              )}
              <button
                type="button"
                onClick={onConfirm}
                className={`min-h-[44px] whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors active:scale-[0.98] ${
                  danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(dialogTree, document.body);
};
