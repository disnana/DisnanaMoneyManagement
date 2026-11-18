import React, { useEffect, useRef } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  ChevronRight,
  Coffee,
  Gamepad2,
  HeartPulse,
  Home,
  Laptop,
  LineChart,
  Pencil,
  ShoppingBasket,
  Shirt,
  Trash2,
  Train,
  Utensils,
  Wallet,
  Zap,
  Gift,
  CircleEllipsis,
} from 'lucide-react';
import { CategoryDef, Transaction } from '../../types/finance';
import { formatJPY, formatSignedJPY, getTransferTotalFees } from '../../utils/format';
import { haptic } from '../../utils/haptics';

type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

const CATEGORY_ICONS: Record<string, IconType> = {
  food: Utensils,
  dining: Coffee,
  daily: ShoppingBasket,
  housing: Home,
  utilities: Zap,
  transport: Train,
  hobby: Gamepad2,
  clothing: Shirt,
  medical: HeartPulse,
  education: BookOpen,
  business_ops: Briefcase,
  other_expense: CircleEllipsis,
  salary: Wallet,
  side_income: Laptop,
  misc_income: Gift,
  investment_income: LineChart,
  other_income: ArrowDownLeft,
  transfer: ArrowLeftRight,
};

export const CategoryBadge: React.FC<{
  category: CategoryDef;
  type?: Transaction['type'];
  size?: 'sm' | 'md';
}> = ({ category, type, size = 'md' }) => {
  const Icon =
    CATEGORY_ICONS[category.id] ??
    (type === 'income' ? ArrowDownLeft : type === 'transfer' ? ArrowLeftRight : ArrowUpRight);
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full ${
        size === 'md' ? 'h-10 w-10' : 'h-8 w-8'
      }`}
      style={{ backgroundColor: `${category.color}1A`, color: category.color }}
    >
      <Icon className={size === 'md' ? 'h-[19px] w-[19px]' : 'h-4 w-4'} strokeWidth={2.1} />
    </span>
  );
};

/** iOS-style inset grouped card */
export const InsetGroup: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/70 ${className}`}
  >
    {children}
  </div>
);

export const SectionHeader: React.FC<{
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, actionLabel, onAction }) => (
  <div className="mb-2 flex items-end justify-between px-1">
    <h3 className="text-[15px] font-bold tracking-tight text-slate-900">{title}</h3>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="-mr-2 inline-flex min-h-[36px] items-center gap-0.5 rounded-lg px-2 text-xs font-semibold text-teal-700 active:bg-teal-50"
      >
        {actionLabel}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);

export function getDayHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日（${wd}）`;
}

/** Shared transaction row body (used by home + ledger) */
export const TxRowBody: React.FC<{
  tx: Transaction;
  category: CategoryDef;
  accountLabel: string;
  subLine?: string;
}> = ({ tx, category, accountLabel, subLine }) => {
  const fee = tx.type === 'transfer' ? getTransferTotalFees(tx) : 0;
  const note =
    tx.type === 'expense' && (tx.pointUsed ?? 0) > 0
      ? `P充当 ${formatJPY(tx.pointUsed ?? 0)}`
      : fee > 0
      ? `手数料 ${formatJPY(fee)}`
      : tx.type === 'income' && tx.netJpyAmount !== undefined && tx.netJpyAmount !== tx.amount
      ? `純入金 ${formatJPY(tx.netJpyAmount)}`
      : null;
  return (
    <div className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left">
      <CategoryBadge category={category} type={tx.type} />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900">
          {tx.title}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
          <span className="truncate">{accountLabel}</span>
          {tx.scope === 'business' && (
            <span className="shrink-0 rounded bg-teal-50 px-1.5 py-px text-[10px] font-bold text-teal-800">
              事業
            </span>
          )}
        </div>
        {subLine && <div className="mt-0.5 truncate text-[11px] text-slate-400">{subLine}</div>}
      </div>
      <div className="shrink-0 text-right font-mono tabular-nums">
        <div
          className={`text-[15px] font-bold ${
            tx.type === 'income'
              ? 'text-emerald-700'
              : tx.type === 'expense'
              ? 'text-slate-900'
              : 'text-slate-500'
          }`}
        >
          {formatSignedJPY(tx.amount, tx.type)}
        </div>
        {note && <div className="text-[10.5px] text-teal-700">{note}</div>}
      </div>
    </div>
  );
};

const ACTION_W = 76;

/**
 * Swipe-left-to-reveal row (edit / delete). Dependency-free: pointer events + direct style
 * writes (no React state per frame, no layout measuring) so long lists stay cheap.
 * Only one row is open at a time via `open`.
 */
export const SwipeRow: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTap: () => void;
  onEdit: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}> = ({ open, onOpenChange, onTap, onEdit, onDelete, children }) => {
  const total = ACTION_W * 2;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const g = useRef({ id: -1, x0: 0, y0: 0, t0: 0, base: 0, dx: 0, locked: false, dragging: false, cancelled: false });

  const setX = (v: number, withTransition: boolean) => {
    const el = surfaceRef.current;
    if (!el) return;
    el.style.transition = withTransition ? 'transform 0.22s cubic-bezier(0.32,0.72,0,1)' : 'none';
    el.style.transform = v === 0 ? '' : `translate3d(${v}px,0,0)`;
  };

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setX(open ? -total : 0, true);
  }, [open, total]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    g.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      t0: performance.now(),
      base: openRef.current ? -total : 0,
      dx: 0,
      locked: false,
      dragging: false,
      cancelled: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (e.pointerId !== s.id || s.cancelled) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.locked) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        s.locked = true;
        s.dragging = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      } else if (Math.abs(dy) > 8) {
        s.cancelled = true;
        return;
      } else return;
    }
    s.dx = dx;
    let x = s.base + dx;
    if (x > 0) x = x * 0.2; // rubber band to the right
    if (x < -total) x = -total + (x + total) * 0.2; // rubber band past the buttons
    setX(x, false);
  };

  const finish = (e: React.PointerEvent, cancelled: boolean) => {
    const s = g.current;
    if (e.pointerId !== s.id) return;
    s.id = -1;
    if (s.dragging) {
      const dt = Math.max(16, performance.now() - s.t0);
      const v = s.dx / dt; // px/ms
      const pos = s.base + s.dx;
      const shouldOpen = cancelled ? openRef.current : v < -0.45 ? true : v > 0.45 ? false : pos < -total * 0.45;
      if (shouldOpen && !openRef.current) haptic(8);
      setX(shouldOpen ? -total : 0, true);
      onOpenChange(shouldOpen);
      return;
    }
    if (!s.cancelled && !cancelled && Math.abs(e.clientX - s.x0) < 8 && Math.abs(e.clientY - s.y0) < 8) {
      if (openRef.current) onOpenChange(false);
      else onTap();
    }
  };

  return (
    <div data-no-tab-swipe="true" className="relative overflow-hidden bg-white">
      <div className="absolute inset-y-0 right-0 flex" style={{ width: total }}>
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            onEdit();
          }}
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-slate-500 text-[11px] font-semibold text-white active:bg-slate-600"
          aria-label="編集"
          tabIndex={open ? 0 : -1}
        >
          <Pencil className="h-4 w-4" />
          編集
        </button>
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            onDelete();
          }}
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-red-600 text-[11px] font-semibold text-white active:bg-red-700"
          aria-label="削除"
          tabIndex={open ? 0 : -1}
        >
          <Trash2 className="h-4 w-4" />
          削除
        </button>
      </div>

      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        style={{ touchAction: 'pan-y' }}
        className="relative bg-white active:bg-slate-50"
      >
        {children}
      </div>
    </div>
  );
};

/** iOS-style segmented control. The thumb slides with a pure-CSS transform (no layout measuring). */
export const Segmented = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
  /** kept for call-site compatibility */
  layoutId?: string;
}) => {
  const n = options.length;
  const index = Math.max(
    0,
    options.findIndex((o) => o.id === value)
  );
  return (
    <div role="tablist" className="relative grid rounded-[10px] bg-slate-200/70 p-0.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0.5 left-0.5 top-0.5 rounded-[8px] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.15)] transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] dark:bg-[#636366]"
        style={{ width: `calc((100% - 4px) / ${n})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => {
              if (!active) haptic(5);
              onChange(o.id);
            }}
            className={`relative z-10 min-h-[34px] rounded-[8px] px-2 text-[13px] font-semibold transition-colors ${
              active ? 'text-slate-900' : 'text-slate-500'
            }`}
          >
            <span className="whitespace-nowrap">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
};
