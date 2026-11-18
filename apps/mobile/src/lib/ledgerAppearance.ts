import type { Ledger } from '@dmm/core/types/finance';
import type { SymbolViewProps } from 'expo-symbols';
import type { PickOption } from './pick';

export const LEDGER_ICONS: readonly { id: string; label: string; icon: SymbolViewProps['name'] }[] = [
  { id: 'personal', label: '人', icon: { ios: 'person.fill', android: 'person' } },
  { id: 'household', label: '家', icon: { ios: 'house.fill', android: 'home' } },
  { id: 'business', label: '仕事', icon: { ios: 'briefcase.fill', android: 'work' } },
  { id: 'people', label: 'グループ', icon: { ios: 'person.2.fill', android: 'group' } },
  { id: 'travel', label: '旅行', icon: { ios: 'airplane', android: 'flight' } },
  { id: 'savings', label: '貯金', icon: { ios: 'banknote.fill', android: 'savings' } },
  { id: 'star', label: '星', icon: { ios: 'star.fill', android: 'star' } },
];

export const LEDGER_COLORS = [
  { id: '', label: 'テーマの色' }, { id: '#0F766E', label: '青緑' }, { id: '#2563EB', label: '青' },
  { id: '#7C3AED', label: '紫' }, { id: '#BE185D', label: 'ピンク' }, { id: '#B45309', label: 'オレンジ' },
  { id: '#15803D', label: '緑' },
] as const;

export const ALL_LEDGER_ICON = { ios: 'square.grid.2x2', android: 'grid_view' } as const;

export function ledgerIcon(ledger: Pick<Ledger, 'kind' | 'icon'>) {
  return (LEDGER_ICONS.find(({ id }) => id === ledger.icon) ??
    LEDGER_ICONS.find(({ id }) => id === ledger.kind) ?? LEDGER_ICONS[0]).icon;
}

export function ledgerColor(ledger?: Pick<Ledger, 'color'>): string | undefined {
  const color = ledger?.color;
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined;
}

export function ledgerOptions(ledgers: readonly Ledger[], selectedId?: string): PickOption[] {
  return ledgers.map((ledger) => ({
    id: ledger.id, label: ledger.name, icon: ledgerIcon(ledger), color: ledgerColor(ledger), selected: ledger.id === selectedId,
  }));
}
