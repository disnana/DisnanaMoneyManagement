import { useMemo, useState } from 'react';
import { TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import type { TransactionType } from '@dmm/core/types/finance';
import { formatMonthLabel } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, Row, Screen, Segmented } from '@/ui/kit';
import { LedgerPicker } from '@/ui/LedgerPicker';
import { TxGroups } from '@/ui/TxGroups';

export default function SearchTransactions() {
  const p = usePalette();
  const { visibleState, accountNameMap, month } = useFinance();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | TransactionType>('all');
  const [onlyMonth, setOnlyMonth] = useState(false);
  const normalized = query.trim().normalize('NFKC').toLocaleLowerCase();
  const hasFilters = normalized || type !== 'all' || onlyMonth;
  const results = useMemo(() => {
    if (!hasFilters) return [];
    return visibleState.transactions.filter((tx) =>
      (type === 'all' || tx.type === type) &&
      (!onlyMonth || tx.date.startsWith(month)) &&
      (!normalized || [
        tx.title, tx.memo, tx.counterparty, tx.accountingSubject, getCategoryById(tx.categoryId).name,
        accountNameMap[tx.accountId], tx.toAccountId ? accountNameMap[tx.toAccountId] : undefined,
      ].some((value) => value?.normalize('NFKC').toLocaleLowerCase().includes(normalized)))
    );
  }, [visibleState.transactions, hasFilters, type, onlyMonth, month, normalized, accountNameMap]);

  return (
    <>
      <Stack.Screen options={{ title: '取引を検索' }} />
      <Screen keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Group>
          <TextInput
            accessibilityLabel="検索キーワード"
            placeholder="内容・メモ・カテゴリ・口座"
            placeholderTextColor={p.textSecondary}
            value={query}
            onChangeText={setQuery}
            clearButtonMode="while-editing"
            returnKeyType="search"
            style={{ minHeight: 52, paddingHorizontal: 16, color: p.text, fontSize: 16 }}
          />
          <Row title="期間" right={onlyMonth ? formatMonthLabel(month) : 'すべての月'} onPress={() => setOnlyMonth((value) => !value)} />
        </Group>
        <LedgerPicker />
        <Segmented value={type} onChange={setType} options={[
          { id: 'all', label: 'すべて' }, { id: 'expense', label: '支出' },
          { id: 'income', label: '収入' }, { id: 'transfer', label: '振替' },
        ]} />
        <TxGroups transactions={results} empty={hasFilters ? '条件に一致する取引はありません' : '検索キーワードや絞り込み条件を指定してください'} />
      </Screen>
    </>
  );
}
