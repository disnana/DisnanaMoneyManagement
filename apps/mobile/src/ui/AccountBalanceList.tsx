import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Account } from '@dmm/core/types/finance';
import { formatJPY } from '@dmm/core/utils/format';
import { hiddenAssetAmount } from '@/lib/homeAssetVisibility';
import { usePalette } from '@/lib/theme';
import { AccountSummaryRow } from './AccountSummaryRow';
import { AppSymbol } from './AppSymbol';
import { CardSurface } from './CardSurface';

type Props = {
  accounts: Account[];
  balances: Record<string, number>;
  accountById: ReadonlyMap<string, Account>;
  onSelect: (id: string) => void;
  preview?: { limit: number; expanded: boolean; toggle: () => void };
  hidden?: boolean;
};

export function AccountBalanceList({ accounts, balances, accountById, onSelect, preview, hidden = false }: Props) {
  const p = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const stacked = (width - 32) / fontScale < 300;
  const canExpand = preview !== undefined && accounts.length > preview.limit;
  const shown = canExpand && !preview.expanded ? accounts.slice(0, preview.limit) : accounts;
  const total = accounts.reduce((sum, account) => sum + (balances[account.id] ?? 0), 0);
  const label = shown.length < accounts.length ? `全${accounts.length}口座の合計` : '口座残高の合計';
  const displayTotal = hidden ? hiddenAssetAmount : formatJPY(total);

  return (
    <CardSurface style={{ borderColor: p.sectionHeader }}>
      {shown.map(account => (
        <AccountSummaryRow key={account.id} account={account} balance={balances[account.id] ?? 0}
          linkedBank={accountById.get(account.linkedBankAccountId ?? '')} balanceList={{ hidden, stacked }}
          onPress={() => onSelect(account.id)} />
      ))}
      {accounts.length === 0 ? <Text style={[s.empty, { color: p.textSecondary }]}>この家計グループに口座がありません</Text> : null}
      {canExpand ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: preview.expanded }} aria-expanded={preview.expanded}
          onPress={preview.toggle} style={({ pressed }) => [s.more, pressed && { backgroundColor: p.fill }]}>
          <Text style={[s.moreText, { color: p.tint }]}>{preview.expanded ? '口座を折りたたむ' : `残りの${accounts.length - shown.length}件を表示`}</Text>
          <AppSymbol name={preview.expanded ? { ios: 'chevron.up', android: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more' }}
            size={14} tintColor={p.tint} />
        </Pressable>
      ) : null}
      <View accessible accessibilityLabel={`${label}、${hidden ? '非表示' : displayTotal}`}
        style={[s.total, (stacked || displayTotal.length >= 12) && s.stacked, { backgroundColor: p.bg, borderTopColor: p.sectionHeader }]}>
        <Text style={[s.totalLabel, { color: p.text }]}>{label}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[s.totalAmount, { color: !hidden && total < 0 ? p.danger : p.text }]}>{displayTotal}</Text>
      </View>
    </CardSurface>
  );
}

const s = StyleSheet.create({
  empty: { padding: 16, fontSize: 14 },
  more: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 16 },
  moreText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
    minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
  totalLabel: { flexShrink: 1, fontSize: 15, fontWeight: '600' },
  totalAmount: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'right', maxWidth: '100%' },
});
