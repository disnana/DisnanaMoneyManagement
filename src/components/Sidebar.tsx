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
}) => {
  return (
    <aside className="hidden h-full w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
      <div className="flex h-full flex-col justify-between bg-white">
        <div className="overflow-y-auto overscroll-y-contain">
          <div className="flex min-h-16 items-center border-b border-slate-200 px-5 py-3">
            <button
              type="button"
              onClick={() => onSelectSection('dashboard')}
              className="min-w-0 text-left transition-opacity hover:opacity-80"
            >
              <span className="block text-[13px] font-bold tracking-tight text-slate-900 leading-snug break-words">
                DisnanaMoneyManagement
              </span>
              <span className="mt-0.5 block font-mono text-[11px] font-semibold text-teal-700 leading-tight">
                (DMM)
              </span>
            </button>
          </div>

          <nav className="space-y-1 p-3.5" aria-label="メインナビゲーション">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all active:scale-[0.99] whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-50 font-semibold text-teal-900'
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

        <div className="space-y-3 border-t border-slate-200 p-4">
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
            onClick={onOpenDataModal}
            className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.99]"
          >
            <Database className="h-4 w-4 shrink-0 text-slate-500" />
            <span>データ管理・バックアップ</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
