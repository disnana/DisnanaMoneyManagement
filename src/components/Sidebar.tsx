import React from 'react';
import {
  LayoutDashboard,
  PieChart,
  ReceiptText,
  SlidersHorizontal,
  CreditCard,
  CalendarClock,
  FileText,
  Database,
  X,
} from 'lucide-react';
import { NavSection } from '../types/finance';
import { formatJPY } from '../utils/format';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  totalAssets: number;
  accountCount: number;
  onOpenDataModal: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { id: 'analytics', label: '分析・円グラフ', icon: PieChart },
  { id: 'transactions', label: '取引履歴', icon: ReceiptText },
  { id: 'budgets', label: '予算管理', icon: SlidersHorizontal },
  { id: 'accounts', label: '口座・クレカ管理', icon: CreditCard },
  { id: 'planning', label: '固定費・貯蓄目標', icon: CalendarClock },
  { id: 'tax', label: '経費・税務処理', icon: FileText },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  totalAssets,
  accountCount,
  onOpenDataModal,
  mobileOpen,
  onCloseMobile,
}) => {
  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white">
      <div className="overflow-y-auto">
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-6">
          <button
            type="button"
            onClick={() => {
              onSelectSection('dashboard');
              onCloseMobile();
            }}
            className="text-left text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap"
          >
            Kakeibo
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="メニューを閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1 p-4" aria-label="メインナビゲーション">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectSection(item.id);
                  onCloseMobile();
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-teal-700' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 p-4 space-y-3">
        <div className="px-2">
          <div className="text-xs font-medium text-slate-500">
            総資産残高 · {accountCount}口座
          </div>
          <div className="mt-1 font-mono text-lg font-semibold tracking-tight text-slate-900 tabular-nums">
            {formatJPY(totalAssets)}
          </div>
        </div>

        <PWAInstallButton />

        <button
          type="button"
          onClick={() => {
            onOpenDataModal();
            onCloseMobile();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap"
        >
          <Database className="h-4 w-4 shrink-0 text-slate-500" />
          <span>データ管理・バックアップ</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 h-screen">{navContent}</div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[82vw] border-r border-slate-200 bg-white shadow-xl">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};
