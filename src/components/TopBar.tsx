import React from 'react';
import { Menu, Plus } from 'lucide-react';
import { NavSection } from '../types/finance';

interface TopBarProps {
  activeSection: NavSection;
  onOpenMobileMenu: () => void;
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
  onOpenMobileMenu,
  onOpenAddTransaction,
}) => {
  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 items-center justify-between gap-8 border-b border-slate-200 bg-white px-4 sm:px-8">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="メニューを開く"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 text-sm text-slate-500 truncate">
          <span className="hidden sm:inline font-medium text-slate-400">Kakeibo</span>
          <span className="hidden sm:inline text-slate-300" aria-hidden="true">
            /
          </span>
          <h1 className="text-base font-semibold text-slate-900 truncate">
            {SECTION_LABELS[activeSection]}
          </h1>
        </div>
      </div>

      <div className="shrink-0">
        <button
          type="button"
          onClick={onOpenAddTransaction}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>収支を記録</span>
        </button>
      </div>
    </header>
  );
};
