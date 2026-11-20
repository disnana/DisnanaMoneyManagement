import { useMemo, type ReactElement } from 'react';
import { Platform, SectionList, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';
import type { Transaction } from '@dmm/core/types/finance';
import { groupTransactionsByDate } from '@dmm/core/utils/metrics';
import { metrics, usePalette } from '@/lib/theme';
import { FormScrollView } from './FormScrollView';
import { TransactionDayHeading } from './TxGroups';
import { TxRow } from './TxRow';

const renderFormScroll = (props: ScrollViewProps) => <FormScrollView {...props} />;
const transactionKey = (tx: Transaction) => tx.id;

export function TransactionSearchList({ transactions, header, empty }: {
  transactions: readonly Transaction[];
  header: ReactElement;
  empty?: string;
}) {
  const p = usePalette();
  const sections = useMemo(() => groupTransactionsByDate(transactions).map(({ date, net, items }) => (
    { key: date, date, net, data: items }
  )), [transactions]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={transactionKey}
      stickySectionHeadersEnabled={false}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      renderScrollComponent={Platform.OS === 'android' ? renderFormScroll : undefined}
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: 8 + metrics.screenPaddingTop, paddingBottom: 48 }}
      ListHeaderComponent={header}
      ListEmptyComponent={empty ? <Text style={{ color: p.textSecondary, padding: 40, marginTop: 16, textAlign: 'center' }}>{empty}</Text> : undefined}
      renderSectionHeader={({ section }) => (
        <View style={{ marginTop: 16, marginBottom: 8 }}>
          <TransactionDayHeading date={section.date} net={section.net} />
        </View>
      )}
      renderItem={({ item, index, section }) => (
        <View style={{
          backgroundColor: p.card, overflow: 'hidden', borderCurve: 'continuous',
          borderTopLeftRadius: index === 0 ? metrics.cardRadius : 0,
          borderTopRightRadius: index === 0 ? metrics.cardRadius : 0,
          borderBottomLeftRadius: index === section.data.length - 1 ? metrics.cardRadius : 0,
          borderBottomRightRadius: index === section.data.length - 1 ? metrics.cardRadius : 0,
        }}>
          {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: p.separator }} /> : null}
          <TxRow tx={item} />
        </View>
      )}
    />
  );
}
