import React, { useState } from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  CreditCard,
  PieChart,
  MoreHorizontal,
  SlidersHorizontal,
  CalendarClock,
  FileText,
  Database,
  ChevronRight,
} from 'lucide-react';
import { NavSection } from '../types/finance';
import { formatJPY } from '../utils/format';
import { ResponsiveSheet } from './ResponsiveSheet';
import { PWAInstallButton } from './PWAInstallButton';

interface MobileBottomNavProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  totalAssets: number;
  accountCount: number;
  onOpenDataModal: () => void;
}

const PRIMARY_TABS: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'ホーム', icon: LayoutDashboard },
  { id: 'transactions', label: '取引', icon: ReceiptText },
  { id: 'accounts', label: '口座', icon: CreditCard },
  { id: 'analytics', label: '分析', icon: PieChart },
];

const MORE_ITEMS: {
  id: NavSection;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'budgets',
    label: '予算管理',
    description: 'カテゴリ別の月間上限と残り日別目安',
    icon: SlidersHorizontal,
  },
  {
    id: 'planning',
    label: '固定費・貯蓄目標',
    description: '毎月の定期収支ワンクリック記帳と目標積立',
    icon: CalendarClock,
  },
  {
    id: 'tax',
    label: '経費・税務処理',
    description: 'ギフト券・雑所得・家事按分・確定申告用CSV',
    icon: FileText,
  },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeSection,
  onSelectSection,
  totalAssets,
  accountCount,
  onOpenDataModal,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreSection =
    activeSection === 'budgets' ||
    activeSection === 'planning' ||
    activeSection === 'tax';

  return (
    <>
      <nav
        aria-label="モバイルナビゲーション"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe lg:hidden"
      >
        <div className="mx-auto grid h-14 max-w-xl grid-cols-5 items-stretch">
          {PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onSelectSection(tab.id);
                }}
                className={`relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 transition-colors active:scale-95 ${
                  active ? 'text-teal-700' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-[11px] font-semibold leading-none whitespace-nowrap">
                  {tab.label}
                </span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-b-full bg-teal-700"
                  />
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 transition-colors active:scale-95 ${
              isMoreSection || moreOpen
                ? 'text-teal-700'
                : 'text-slate-500 hover:text-slate-900'
            }`}
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="h-5 w-5 shrink-0" />
            <span className="text-[11px] font-semibold leading-none whitespace-nowrap">
              その他
            </span>
            {isMoreSection && (
              <span
                aria-hidden="true"
                className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-b-full bg-teal-700"
              />
            )}
          </button>
        </div>
      </nav>

      <ResponsiveSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="メニュー・ツール"
        titleId="mobile-more-sheet-title"
      >
        <div className="space-y-5">
          {/* Asset summary */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3.5">
            <div>
              <div className="text-xs font-medium text-slate-500">
                DisnanaMoneyManagement(DMM) · {accountCount}口座
              </div>
              <div className="mt-0.5 text-xs text-slate-500">総資産残高</div>
            </div>
            <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">
              {formatJPY(totalAssets)}
            </div>
          </div>

          {/* Secondary Navigation */}
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectSection(item.id);
                    setMoreOpen(false);
                  }}
                  className={`flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-slate-100 ${
                    isActive ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        isActive
                          ? 'border-teal-200 bg-teal-100 text-teal-800'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-semibold ${
                          isActive ? 'text-teal-900' : 'text-slate-900'
                        }`}
                      >
                        {item.label}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {item.description}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              );
            })}
          </div>

          {/* Data & PWA */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onOpenDataModal();
              }}
              className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 active:bg-slate-100"
            >
              <span className="flex items-center gap-3">
                <Database className="h-4 w-4 text-slate-500" />
                <span>データ管理・バックアップ</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>

            <PWAInstallButton />
          </div>
        </div>
      </ResponsiveSheet>
    </>
  );
};
