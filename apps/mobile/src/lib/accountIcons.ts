import type { SymbolViewProps } from 'expo-symbols';
import type { AccountType } from '@dmm/core/types/finance';

export const ACCOUNT_ICONS: Record<AccountType, SymbolViewProps['name']> = {
  bank: { ios: 'building.columns.fill', android: 'account_balance' },
  psp: { ios: 'arrow.triangle.2.circlepath', android: 'sync_alt' },
  foreign_bank: { ios: 'globe', android: 'language' },
  credit: { ios: 'creditcard.fill', android: 'credit_card' },
  debit: { ios: 'creditcard', android: 'credit_card' },
  cash: { ios: 'wallet.pass.fill', android: 'wallet' },
  emoney: { ios: 'iphone', android: 'smartphone' },
  investment: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up' },
};
