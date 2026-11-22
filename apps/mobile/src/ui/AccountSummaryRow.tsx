import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ACCOUNT_TYPE_LABELS } from '@dmm/core/data/categories';
import type { Account } from '@dmm/core/types/finance';
import { formatJPY } from '@dmm/core/utils/format';
import { hiddenAssetAmount } from '@/lib/homeAssetVisibility';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { usePalette } from '@/lib/theme';
import { AppSymbol } from './AppSymbol';
import { IconBadge } from './kit';
import { CardSurface } from './CardSurface';

export function isPaymentCard(account: Account) {
  return account.type === 'credit' || account.type === 'debit';
}

export function AccountSummaryRow({ account, balance, bill, linkedBank, sorting = false, balanceList, onPress }: {
  account: Account;
  balance: number;
  bill?: { label: string; remaining: number; warning?: string };
  linkedBank?: Account;
  sorting?: boolean;
  balanceList?: { hidden: boolean; stacked: boolean };
  onPress?: () => void;
}) {
  const p = usePalette();
  const { type, name, institution } = account;
  const detail = type === 'debit'
    ? linkedBank ? `引落口座 · ${linkedBank.name}` : '引落口座が未設定'
    : institution && !name.includes(institution) ? `${ACCOUNT_TYPE_LABELS[type]} · ${institution}` : ACCOUNT_TYPE_LABELS[type];
  const amount = bill?.remaining ?? balance;
  const showAmount = !sorting && (balanceList !== undefined || type !== 'debit' || balance !== 0);
  const hidden = balanceList?.hidden === true;
  const formatted = hidden ? hiddenAssetAmount : formatJPY(amount);
  const stacked = balanceList && (balanceList.stacked || formatted.length >= 12);
  const supporting = balanceList && detail === ACCOUNT_TYPE_LABELS[type] ? undefined : bill?.warning ?? detail;
  const tone = type === 'credit' ? '#8167BF'
    : type === 'bank' || type === 'foreign_bank' ? p.income : p.tint;

  let priceColor = p.income;
  if (hidden) priceColor = p.text;
  else if (bill ? amount > 0 : amount < 0) priceColor = p.danger;
  else if (balanceList && amount === 0) priceColor = p.textSecondary;
  const price = showAmount ? (
    <View style={{ maxWidth: stacked ? '100%' : '48%', alignSelf: stacked ? 'flex-end' : undefined, alignItems: 'flex-end', gap: 3 }}>
      {bill ? <Text style={{ color: p.textSecondary, fontSize: 11 }}>{bill.label}</Text> : null}
      <Text numberOfLines={1} adjustsFontSizeToFit
        style={{ color: priceColor,
          fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatted}</Text>
    </View>
  ) : null;
  const content = (
    <>
      <IconBadge name={ACCOUNT_ICONS[type]} color={tone} size={balanceList ? 34 : 36} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={sorting ? 1 : stacked ? 3 : 2} style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{name}</Text>
        {supporting ? (
          <Text numberOfLines={stacked ? 2 : 1} style={{ color: bill?.warning ? p.danger : p.textSecondary, fontSize: 12 }}>{supporting}</Text>
        ) : null}
        {stacked ? price : null}
      </View>
      {stacked ? null : price}
      {sorting || balanceList ? null : <AppSymbol name={{ ios: 'chevron.right', android: 'chevron_right' }} size={12} tintColor={p.textSecondary} />}
    </>
  );
  const rowStyle = { minHeight: balanceList ? 54 : 60, flexDirection: 'row' as const, alignItems: 'center' as const,
    paddingHorizontal: balanceList ? 16 : 12, paddingVertical: 8, gap: 9 };

  return sorting
    ? <View style={rowStyle}>{content}</View>
    : <Pressable accessibilityRole="button" onPress={onPress}
        accessibilityLabel={balanceList ? [name, supporting ?? ACCOUNT_TYPE_LABELS[type], hidden ? '残高は非表示' : `残高 ${formatted}`].join('、') : undefined}
        style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? p.fill : p.card }]}>{content}</Pressable>;
}

export function AccountSummaryGroup({ children }: { children: ReactNode }) {
  const p = usePalette();
  return (
    <CardSurface>
      {Children.toArray(children).map((child, index) => (
        <View key={index}>
          {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.outline, marginHorizontal: 12 }} /> : null}
          {child}
        </View>
      ))}
    </CardSurface>
  );
}
