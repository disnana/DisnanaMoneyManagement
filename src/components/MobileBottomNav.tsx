import React from 'react';
import { motion } from 'motion/react';
import { LayoutDashboard, ReceiptText, CreditCard, PieChart, Plus } from 'lucide-react';
import { NavSection } from '../types/finance';
import { haptic } from '../utils/haptics';

interface MobileBottomNavProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onAdd: () => void;
}

type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

interface Tab {
  /** section opened when tapping the tab */
  id: NavSection;
  /** sections that keep this tab highlighted */
  matches: NavSection[];
  label: string;
  icon: IconType;
}

const LEFT_TABS: Tab[] = [
  { id: 'dashboard', matches: ['dashboard'], label: 'ホーム', icon: LayoutDashboard },
  { id: 'transactions', matches: ['transactions'], label: '取引', icon: ReceiptText },
];

const RIGHT_TABS: Tab[] = [
  { id: 'analytics', matches: ['analytics', 'budgets'], label: '分析・予算', icon: PieChart },
  { id: 'accounts', matches: ['accounts', 'planning'], label: '口座', icon: CreditCard },
];

const NavIcon: React.FC<{ active: boolean; children: React.ReactNode }> = ({
  active,
  children,
}) => (
  <span className="relative flex h-8 w-14 items-center justify-center transition-transform duration-100 ease-out [button:active_&]:scale-90">
    {active && (
      <motion.span
        layoutId="mobile-nav-pill"
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-teal-100/80"
        transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.8 }}
      />
    )}
    <span className="relative">{children}</span>
  </span>
);

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeSection,
  onSelectSection,
  onAdd,
}) => {
  const renderTab = (tab: Tab) => {
    const Icon = tab.icon;
    const active = tab.matches.includes(activeSection);
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => {
          if (!active) haptic(6);
          onSelectSection(tab.id);
        }}
        aria-current={active ? 'page' : undefined}
        className={`relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-0.5 transition-colors ${
          active ? 'text-teal-700' : 'text-slate-500'
        }`}
      >
        <NavIcon active={active}>
          <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={active ? 2.4 : 1.9} />
        </NavIcon>
        <span
          className={`text-[10.5px] leading-none whitespace-nowrap ${
            active ? 'font-bold' : 'font-medium'
          }`}
        >
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    <nav
      aria-label="モバイルナビゲーション"
      className="mobile-nav glass-bar z-30 shrink-0 border-t border-slate-200/80 pl-safe pr-safe lg:hidden"
      style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mx-auto grid h-[58px] max-w-xl grid-cols-5 items-stretch">
        {LEFT_TABS.map(renderTab)}

        <div className="flex items-start justify-center">
          <button
            type="button"
            onClick={() => {
              haptic(10);
              onAdd();
            }}
            aria-label="収支を記録"
            className="-mt-4 flex h-[54px] w-[54px] items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-900/30 ring-4 ring-white/90 transition-transform duration-100 active:scale-90"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </button>
        </div>

        {RIGHT_TABS.map(renderTab)}
      </div>
    </nav>
  );
};
