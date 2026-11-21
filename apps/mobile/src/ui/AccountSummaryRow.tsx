import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { ACCOUNT_TYPE_LABELS } from '@dmm/core/data/categories';
import type { Account } from '@dmm/core/types/finance';
import { formatJPY } from '@dmm/core/utils/format';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { usePalette } from '@/lib/theme';
import { IconBadge } from './kit';
import { CardSurface } from './CardSurface';

export function isPaymentCard(account: Account) {
  return account.type === 'credit' || account.type === 'debit';
}

export function AccountSummaryRow({ account, balance, bill, linkedBank, sorting = false, inline = false, onPress }: {
  account: Account;
  balance: number;
  bill?: { label: string; remaining: number; warning?: string };
  linkedBank?: Account;
  sorting?: boolean;
  inline?: boolean;
  onPress?: () => void;
}) {
  const p = usePalette();
  const { type, name, institution } = account;
  const detail = type === 'debit'
    ? linkedBank ? `引落口座 · ${linkedBank.name}` : '引落口座が未設定'
    : institution && !name.includes(institution) ? `${ACCOUNT_TYPE_LABELS[type]} · ${institution}` : ACCOUNT_TYPE_LABELS[type];
  const amount = bill?.remaining ?? balance;
  const showAmount = !sorting && (type !== 'debit' || balance !== 0);
  const tone = type === 'credit' ? '#8167BF'
    : type === 'bank' || type === 'foreign_bank' ? p.income : p.tint;

  const content = (
    <>
      <IconBadge name={ACCOUNT_ICONS[type]} color={tone} size={36} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={sorting ? 1 : 2} style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{name}</Text>
        <Text numberOfLines={1} style={{ color: bill?.warning ? p.danger : p.textSecondary, fontSize: 12 }}>
          {bill?.warning ?? detail}
        </Text>
      </View>
      {showAmount ? (
        <View style={{ maxWidth: '48%', alignItems: 'flex-end', gap: 3 }}>
          {bill ? <Text style={{ color: p.textSecondary, fontSize: 11 }}>{bill.label}</Text> : null}
          <Text numberOfLines={1} adjustsFontSizeToFit
            style={{ color: (bill ? amount > 0 : amount < 0) ? p.danger : p.income,
              fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatJPY(amount)}</Text>
        </View>
      ) : null}
      {sorting ? null : <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={12} tintColor={p.textSecondary} />}
    </>
  );
  const rowStyle = { minHeight: 60, flexDirection: 'row' as const, alignItems: 'center' as const,
    paddingHorizontal: 12, paddingVertical: 8, gap: 9 };

  return sorting
    ? <View style={rowStyle}>{content}</View>
    : <Pressable accessibilityRole="button" onPress={onPress}
        style={({ pressed }) => [rowStyle, inline && { paddingHorizontal: 4, minHeight: 56 },
          { backgroundColor: pressed ? p.fill : inline ? 'transparent' : p.card }]}>{content}</Pressable>;
}

export function AccountSummaryGroup({ children, inline = false }: { children: ReactNode; inline?: boolean }) {
  const p = usePalette();
  const rows = Children.toArray(children).map((child, index) => (
    <View key={index}>
      {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: inline ? p.fill : p.outline,
        marginHorizontal: inline ? 4 : 12 }} /> : null}
      {child}
    </View>
  ));
  return inline ? <View>{rows}</View> : <CardSurface>{rows}</CardSurface>;
}
