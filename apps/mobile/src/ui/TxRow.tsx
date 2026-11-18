import { Alert } from 'react-native';
import { router } from 'expo-router';
import type { Transaction } from '@dmm/core/types/finance';
import { getCategoryById } from '@dmm/core/data/categories';
import { formatSignedJPY, formatShortDate } from '@dmm/core/utils/format';
import { categoryIcon } from '@/lib/categoryIcons';
import { pickOne } from '@/lib/pick';
import { success } from '@/lib/haptics';
import { usePalette } from '@/lib/theme';
import { useFinance } from '@/lib/store';
import { Row } from '@/ui/kit';

/** One transaction row. Tap = edit, long-press = action list (native action sheet on iOS). */
export function TxRow({ tx, showDate }: { tx: Transaction; showDate?: boolean }) {
  const p = usePalette();
  const { state, accountNameMap, deleteTransaction } = useFinance();
  const cat = getCategoryById(tx.categoryId, state.customCategories);
  const acc = accountNameMap[tx.accountId] ?? '口座';
  const to = tx.toAccountId ? accountNameMap[tx.toAccountId] ?? '口座' : '';

  const onLongPress = async () => {
    const choice = await pickOne(tx.title, [
      { id: 'edit', label: '編集' },
      { id: 'delete', label: '削除', destructive: true },
    ]);
    if (choice === 'edit') router.push({ pathname: '/add', params: { id: tx.id } });
    if (choice === 'delete') {
      Alert.alert('削除しますか？', `「${tx.title}」を削除します。`, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            deleteTransaction(tx.id);
            success();
          },
        },
      ]);
    }
  };

  return (
    <Row
      icon={categoryIcon(cat.icon ?? tx.categoryId)}
      iconColor={cat.color}
      title={tx.title}
      subtitle={`${showDate ? `${formatShortDate(tx.date)} · ` : ''}${tx.type === 'transfer' ? `${acc} → ${to}` : `${cat.name} · ${acc}`}`}
      right={formatSignedJPY(tx.amount, tx.type)}
      rightColor={tx.type === 'income' ? p.income : p.text}
      onPress={() => router.push({ pathname: '/add', params: { id: tx.id } })}
      onLongPress={onLongPress}
    />
  );
}
