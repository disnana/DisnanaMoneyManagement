import { useRef, useState, type ReactNode } from 'react';
import type { Transaction } from '../types/finance';

const pageSize = 50;

/** Keep a complete result set for totals and exports, and mount one page of rows at a time. */
export function TransactionPages({ rows, children }: {
  rows: Transaction[];
  children: (visible: Transaction[]) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const startOfResults = useRef<HTMLDivElement>(null);
  const pages = Math.ceil(rows.length / pageSize);
  const current = Math.min(page, Math.max(0, pages - 1));
  const start = current * pageSize;
  const end = Math.min(start + pageSize, rows.length);
  const changePage = (next: number) => {
    setPage(next);
    startOfResults.current?.focus({ preventScroll: true });
    startOfResults.current?.scrollIntoView({ block: 'start' });
  };

  return (
    <>
      <div ref={startOfResults} tabIndex={-1} role="region" aria-label="取引一覧" className="scroll-mt-28 space-y-4 focus:outline-none lg:scroll-mt-0">
        {children(pages > 1 ? rows.slice(start, end) : rows)}
      </div>
      {pages > 1 && (
        <nav aria-label="取引のページ切り替え" className="flex items-center justify-between gap-2 text-sm">
          <button type="button" disabled={current === 0} onClick={() => changePage(current - 1)}
            className="min-h-[44px] rounded-xl bg-white px-4 font-semibold text-teal-700 ring-1 ring-slate-200 disabled:opacity-40">
            前のページ
          </button>
          <span aria-live="polite" className="text-xs text-slate-600 tabular-nums">
            {start + 1}〜{end}件 / {rows.length}件
          </span>
          <button type="button" disabled={current + 1 >= pages} onClick={() => changePage(current + 1)}
            className="min-h-[44px] rounded-xl bg-white px-4 font-semibold text-teal-700 ring-1 ring-slate-200 disabled:opacity-40">
            次のページ
          </button>
        </nav>
      )}
    </>
  );
}
