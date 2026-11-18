import React, { useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonthLabel, getCurrentMonthKey, shiftMonth } from '../utils/format';
import { ResponsiveSheet } from './ResponsiveSheet';

interface MonthSwitcherBarProps {
  selectedMonth: string;
  onChangeMonth: (monthKey: string) => void;
  allowAll?: boolean;
  className?: string;
}

const MONTHS_GRID = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export const MonthSwitcherBar: React.FC<MonthSwitcherBarProps> = ({
  selectedMonth,
  onChangeMonth,
  allowAll = false,
  className = '',
}) => {
  const currentRealMonth = getCurrentMonthKey();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(() =>
    Number((selectedMonth === 'all' ? currentRealMonth : selectedMonth).slice(0, 4))
  );
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const openPicker = () => {
    const refMonth = selectedMonth === 'all' ? currentRealMonth : selectedMonth;
    const parsedYear = Number(refMonth.slice(0, 4));
    setPickerYear(Number.isFinite(parsedYear) && parsedYear > 1900 ? parsedYear : Number(currentRealMonth.slice(0, 4)));
    setPickerOpen(true);
  };

  const stepMonth = (delta: number) => {
    if (selectedMonth === 'all') {
      onChangeMonth(delta < 0 ? shiftMonth(currentRealMonth, -1) : currentRealMonth);
      return;
    }
    onChangeMonth(shiftMonth(selectedMonth, delta));
  };

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
      stepMonth(dx < 0 ? 1 : -1);
    }
  };

  const centerLabel =
    selectedMonth === 'all' ? '全期間' : formatMonthLabel(selectedMonth);

  return (
    <>
      <div
        data-no-tab-swipe="true"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`inline-flex select-none items-center justify-between rounded-xl border border-slate-200 bg-white touch-pan-y ${className}`}
        title="左右スワイプ、または中央タップで年月を選択できます"
      >
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-l-xl text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-95"
          aria-label="前の月"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={openPicker}
          className="inline-flex min-h-[44px] min-w-[126px] flex-1 items-center justify-center gap-1.5 px-3 text-center font-mono text-sm font-semibold text-slate-900 tabular-nums transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
          aria-label={`年月を選択（現在: ${centerLabel}）`}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden="true" />
          <span>{centerLabel}</span>
        </button>

        <button
          type="button"
          onClick={() => stepMonth(1)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-r-xl text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-95"
          aria-label="次の月"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <ResponsiveSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="年月を選択"
        titleId="month-picker-sheet-title"
        maxWidthClass="sm:max-w-sm"
      >
        <div className="space-y-4">
          {allowAll && (
            <button
              type="button"
              onClick={() => {
                onChangeMonth('all');
                setPickerOpen(false);
              }}
              className={`flex min-h-[44px] w-full items-center justify-center rounded-xl border px-4 text-xs font-semibold transition-all active:scale-[0.98] ${
                selectedMonth === 'all'
                  ? 'border-teal-700 bg-teal-50 text-teal-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              全期間（すべての月）を表示
            </button>
          )}

          {/* Year Switcher */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-1">
            <button
              type="button"
              onClick={() => setPickerYear((y) => y - 1)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white hover:text-slate-900 active:scale-95"
              aria-label="前年"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
              {pickerYear}年
            </span>
            <button
              type="button"
              onClick={() => setPickerYear((y) => y + 1)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white hover:text-slate-900 active:scale-95"
              aria-label="翌年"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* 3x4 Month Tile Grid */}
          <div className="grid grid-cols-3 gap-2">
            {MONTHS_GRID.map((monthNum) => {
              const monthKey = `${pickerYear}-${String(monthNum).padStart(2, '0')}`;
              const isSelected = selectedMonth === monthKey;
              const isCurrent = monthKey === currentRealMonth;
              return (
                <button
                  key={monthKey}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    onChangeMonth(monthKey);
                    setPickerOpen(false);
                  }}
                  className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-2 py-2 transition-all active:scale-95 ${
                    isSelected
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {monthNum}月
                  </span>
                  {isCurrent && (
                    <span className="mt-0.5 text-[10px] font-semibold leading-none text-teal-700">
                      今月
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              onChangeMonth(currentRealMonth);
              setPickerOpen(false);
            }}
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-teal-700 transition-colors hover:bg-slate-100 active:scale-[0.98]"
          >
            今月（{formatMonthLabel(currentRealMonth)}）に戻る
          </button>
        </div>
      </ResponsiveSheet>
    </>
  );
};
