import React from 'react';
import { ChevronLeft, Menu, Plus } from 'lucide-react';
import { NavSection } from '../types/finance';

interface TopBarProps {
  activeSection: NavSection;
  onOpenAddTransaction: () => void;
  onOpenMenu: () => void;
  onBack: () => void;
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

const MOBILE_LABELS: Partial<Record<NavSection, string>> = {
  dashboard: 'ホーム',
  analytics: '分析・予算',
  budgets: '分析・予算',
  transactions: '取引',
  accounts: '口座・固定費',
  planning: '口座・固定費',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onOpenAddTransaction,
  onOpenMenu,
  onBack,
}) => {
  const showBack = activeSection === 'tax';
  return (
    <header
      className="z-30 flex shrink-0 items-center justify-between gap-2 border-b border-teal-800/30 bg-teal-700 text-white lg:h-16 lg:border-slate-200/80 lg:bg-white lg:text-slate-900 lg:px-8"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))',
        minHeight: 'calc(3rem + env(safe-area-inset-top, 0px))',
      }}
    >
      <div className="flex min-w-0 items-center gap-1">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="ホームに戻る"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full active:bg-white/15 lg:hidden"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <h1
          className={`truncate text-[17px] font-bold tracking-tight lg:text-lg ${
            showBack ? '' : 'pl-2'
          }`}
        >
          <span className="lg:hidden">{MOBILE_LABELS[activeSection] ?? SECTION_LABELS[activeSection]}</span>
          <span className="hidden lg:inline">{SECTION_LABELS[activeSection]}</span>
        </h1>
      </div>

      <div className="shrink-0">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="メニュー"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90 active:bg-white/15 lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={onOpenAddTransaction}
          className="hidden min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-teal-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap lg:inline-flex"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>収支を記録</span>
        </button>
      </div>
    </header>
  );
};
