import { useState } from 'react';
import { router } from 'expo-router';
import type { Transaction } from '@dmm/core/types/finance';
import { getCategoryById } from '@dmm/core/data/categories';
import { formatJPY, formatSignedJPY, formatShortDate, getEffectiveOutflow, getTransferTotalFees } from '@dmm/core/utils/format';
import { categoryIcon } from '@/lib/categoryIcons';
import { pickOne } from '@/lib/pick';
import { success } from '@/lib/haptics';
import { usePalette } from '@/lib/theme';
import { useFinance } from '@/lib/store';
import { DeleteDialog } from '@/ui/DeleteDialog';
import { Row } from '@/ui/kit';

/** One transaction row. Tap = edit, long-press = action list (native action sheet on iOS). */
export function TxRow({ tx, showDate, showMemo }: { tx: Transaction; showDate?: boolean; showMemo?: boolean }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
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
    if (choice === 'delete') setDeleteOpen(true);
  };

  const accounts = tx.type === 'transfer' ? `${acc} → ${to}`
    : showMemo ? `${acc} · ${cat.name}` : `${cat.name} · ${acc}`;
  const points = tx.pointUsed ?? 0;
  const pointDetail = points > 0
    ? `ポイント充当 ${formatJPY(points)} · ${tx.type === 'transfer' ? '出金' : '実支払'} ${formatJPY(getEffectiveOutflow(tx) + getTransferTotalFees(tx))}`
    : '';
  const memo = showMemo ? tx.memo?.trim() : undefined;

  return (
    <>
      <Row
        icon={categoryIcon(cat.icon ?? tx.categoryId)}
        iconColor={cat.color}
        iconFilledInDark
        title={tx.title}
        subtitle={`${showDate ? `${formatShortDate(tx.date)} · ` : ''}${accounts}`}
        detail={[pointDetail, memo].filter(Boolean).join('\n') || undefined}
        right={tx.amount === 0 ? formatJPY(0) : formatSignedJPY(tx.amount, tx.type)}
        rightColor={tx.amount === 0 || tx.type === 'income' ? p.income : tx.type === 'expense' ? p.danger : p.text}
        onPress={() => router.push({ pathname: '/add', params: { id: tx.id } })}
        onLongPress={onLongPress}
      />
      {deleteOpen ? (
        <DeleteDialog visible heading="取引を削除しますか？" title={tx.title}
          onCancel={() => setDeleteOpen(false)} onDelete={async () => {
            if (!await deleteTransaction(tx.id)) return;
            setDeleteOpen(false);
            success();
          }} />
      ) : null}
    </>
  );
}
