import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonthLabel, shiftMonth } from '../utils/format';

interface MonthSwitcherBarProps {
  selectedMonth: string;
  onChangeMonth: (monthKey: string) => void;
  className?: string;
}

export const MonthSwitcherBar: React.FC<MonthSwitcherBarProps> = ({
  selectedMonth,
  onChangeMonth,
  className = '',
}) => {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) {
        onChangeMonth(shiftMonth(selectedMonth, 1));
      } else {
        onChangeMonth(shiftMonth(selectedMonth, -1));
      }
    }
  };

  return (
    <div
      data-no-tab-swipe="true"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`inline-flex select-none items-center justify-between rounded-xl border border-slate-200 bg-white touch-pan-y ${className}`}
      title="左右スワイプでも月を切り替えられます"
    >
      <button
        type="button"
        onClick={() => onChangeMonth(shiftMonth(selectedMonth, -1))}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-l-xl text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-95"
        aria-label="前の月"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[106px] px-3 text-center font-mono text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">
        {formatMonthLabel(selectedMonth)}
      </span>
      <button
        type="button"
        onClick={() => onChangeMonth(shiftMonth(selectedMonth, 1))}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-r-xl text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-95"
        aria-label="次の月"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
};
