import React from 'react';
import { Plus } from 'lucide-react';
import { NavSection } from '../types/finance';

interface TopBarProps {
  activeSection: NavSection;
  onOpenAddTransaction: () => void;
}

const SECTION_LABELS: Record<NavSection, string> = {
  dashboard: 'ダッシュボード',
  analytics: '分析・円グラフ',
  transactions: '取引履歴',
  budgets: '予算管理',
  accounts: '口座・クレカ管理',
  planning: '固定費・貯蓄目標',
  tax: '経費・税務処理',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onOpenAddTransaction,
}) => {
  return (
    <header className="sticky top-0 z-30 flex h-13 sm:h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 sm:px-8 pt-safe">
      <div className="min-w-0">
        <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-tight truncate">
          {SECTION_LABELS[activeSection]}
        </h1>
      </div>

      <div className="shrink-0">
        <button
          type="button"
          onClick={onOpenAddTransaction}
          className="inline-flex min-h-[40px] sm:min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-all hover:bg-teal-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>収支を記録</span>
        </button>
      </div>
    </header>
  );
};
