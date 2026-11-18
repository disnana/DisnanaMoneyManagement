import React from 'react';
import { NavSection } from '../../types/finance';
import { Segmented } from './MobileKit';

export const TAB_GROUPS: Record<string, { id: NavSection; label: string }[]> = {
  analysis: [
    { id: 'analytics', label: '分析' },
    { id: 'budgets', label: '予算' },
  ],
  accounts: [
    { id: 'accounts', label: '口座・カード' },
    { id: 'planning', label: '固定費・貯蓄' },
  ],
};

export function groupOf(section: NavSection): keyof typeof TAB_GROUPS | null {
  for (const [k, items] of Object.entries(TAB_GROUPS)) {
    if (items.some((i) => i.id === section)) return k;
  }
  return null;
}

/** In-page segmented switch for sections merged into one bottom tab. */
export const SectionTabs: React.FC<{
  group: keyof typeof TAB_GROUPS;
  active: NavSection;
  onSelect: (s: NavSection) => void;
}> = ({ group, active, onSelect }) => (
  <div data-no-tab-swipe="true" className="mx-auto mb-4 w-full max-w-2xl">
    <Segmented
      layoutId={`section-tabs-${group}`}
      value={active}
      options={TAB_GROUPS[group]}
      onChange={onSelect}
    />
  </div>
);
