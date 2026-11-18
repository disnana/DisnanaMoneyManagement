import React, { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
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

/** Swipe-left-to-reveal row (edit / delete). Only one row open at a time via `open`. */
export const SwipeRow: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTap: () => void;
  onEdit: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}> = ({ open, onOpenChange, onTap, onEdit, onDelete, children }) => {
  const x = useMotionValue(0);
  const total = ACTION_W * 2;
  const draggedRef = useRef(false);

  useEffect(() => {
    animate(x, open ? -total : 0, { type: 'spring', stiffness: 520, damping: 42 });
  }, [open, x, total]);

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

      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -total, right: 0 }}
        dragElastic={{ left: 0.08, right: 0 }}
        dragMomentum={false}
        onTapStart={() => {
          draggedRef.current = false;
        }}
        onDragStart={() => {
          draggedRef.current = true;
        }}
        onDragEnd={(_, info) => {
          const shouldOpen = open
            ? info.offset.x > -total * 0.35 && info.velocity.x < 300
              ? false
              : true
            : info.offset.x < -total * 0.3 || info.velocity.x < -450;
          if (shouldOpen && !open) haptic(8);
          if (shouldOpen === open) {
            animate(x, open ? -total : 0, { type: 'spring', stiffness: 520, damping: 42 });
          }
          onOpenChange(shouldOpen);
        }}
        onTap={() => {
          if (draggedRef.current) return;
          if (open) onOpenChange(false);
          else onTap();
        }}
        className="relative bg-white active:bg-slate-50"
      >
        {children}
      </motion.div>
    </div>
  );
};

/** iOS-style segmented control with a sliding thumb */
export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  layoutId,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
  layoutId: string;
}) => (
  <div
    role="tablist"
    className="grid rounded-[10px] bg-slate-200/70 p-0.5"
    style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
  >
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
          className={`relative min-h-[34px] rounded-[8px] px-2 text-[13px] font-semibold transition-colors ${
            active ? 'text-slate-900' : 'text-slate-500'
          }`}
        >
          {active && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-[8px] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.15)] dark:bg-[#636366]"
              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
            />
          )}
          <span className="relative whitespace-nowrap">{o.label}</span>
        </button>
      );
    })}
  </div>
);
