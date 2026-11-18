import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, X } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, onDismiss }) => {
  return (
    <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-4 left-4 z-50 flex flex-col items-center sm:left-auto sm:right-5 sm:items-end lg:bottom-5">
      <AnimatePresence>
        {message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            role="status"
            className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-slate-200 bg-neutral-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{message}</span>
            <button
              type="button"
              onClick={onDismiss}
              className="ml-1 inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="通知を閉じる"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
