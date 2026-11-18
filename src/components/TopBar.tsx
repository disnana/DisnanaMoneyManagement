import React from 'react';
import { ChevronLeft, Menu, Plus } from 'lucide-react';
import { NavSection } from '../types/finance';

interface TopBarProps {
  activeSection: NavSection;
  onOpenAddTransaction: () => void;
  onOpenMenu: () => void;
  onBack: () => void;
  /** main content has scrolled past the large title */
  scrolled?: boolean;
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
  scrolled = false,
}) => {
  const showBack = activeSection === 'tax';
  return (
    <header
      className={`glass-bar relative z-30 flex shrink-0 items-center justify-between gap-2 border-b text-slate-900 transition-[border-color] duration-200 lg:h-16 lg:px-8 ${
        scrolled ? 'border-slate-200/80' : 'border-transparent lg:border-slate-200/80'
      }`}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'max(0.25rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))',
        minHeight: 'calc(2.75rem + env(safe-area-inset-top, 0px))',
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="戻る"
            className="inline-flex h-11 items-center gap-0.5 rounded-full pl-1 pr-3 text-[17px] text-teal-700 active:opacity-50 lg:hidden"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.4} />
            ホーム
          </button>
        )}
        {/* iOS: compact title fades in once the large title scrolls away */}
        <h1
          className={`truncate text-[17px] font-semibold tracking-tight transition-opacity duration-150 lg:text-lg lg:font-bold lg:opacity-100 ${
            showBack ? 'absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0' : 'pl-3 lg:pl-0'
          } ${scrolled ? 'opacity-100' : 'opacity-0'}`}
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
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-teal-700 transition-opacity active:opacity-50 lg:hidden"
        >
          <Menu className="h-[22px] w-[22px]" strokeWidth={2.2} />
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
