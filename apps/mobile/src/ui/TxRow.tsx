import { useState } from 'react';
import { router } from 'expo-router';
import type { Transaction } from '@dmm/core/types/finance';
import { getCategoryById } from '@dmm/core/data/categories';
import { formatJPY, formatShortDate, getEffectiveOutflow, getTransferTotalFees } from '@dmm/core/utils/format';
import { historyAmount } from '@/lib/historySections';
import { HistoryEntry } from './HistoryEntry';
import { categoryIcon } from '@/lib/categoryIcons';
import { pickOne } from '@/lib/pick';
import { success } from '@/lib/haptics';
import { usePalette } from '@/lib/theme';
import { useFinance } from '@/lib/store';
import { DeleteDialog } from '@/ui/DeleteDialog';
import { Row } from '@/ui/kit';

/** One transaction row. Tap = edit, long-press = action list (native action sheet on iOS). */
export function TxRow({ tx, showDate, historyLayout }: { tx: Transaction; showDate?: boolean; historyLayout?: 'columns' | 'stacked' }) {
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
    : historyLayout ? `${acc} · ${cat.name}` : `${cat.name} · ${acc}`;
  const points = tx.pointUsed ?? 0;
  const fees = getTransferTotalFees(tx);
  const pointDetail = points > 0
    ? `ポイント充当 ${formatJPY(points)} · ${tx.type === 'transfer' ? '出金' : '実支払'} ${formatJPY(getEffectiveOutflow(tx) + fees)}`
    : '';

  const passThrough = tx.advance ? '立替（家計の収支対象外）' : tx.reimbursementOf ? '立替の回収（家計の収支対象外）' : '';
  const signed = tx.type === 'expense' ? -tx.amount : tx.amount;
  const row = {
    icon: categoryIcon(cat.icon ?? tx.categoryId),
    iconColor: cat.color,
    title: tx.title,
    subtitle: `${showDate ? `${formatShortDate(tx.date)} · ` : ''}${accounts}`,
    detail: [passThrough, pointDetail, fees > 0 ? `手数料 ${formatJPY(fees)}` : ''].filter(Boolean).join('\n') || undefined,
    right: historyAmount(tx),
    rightColor: signed === 0 || tx.type === 'transfer' ? p.text : signed < 0 ? p.danger : p.income,
    onPress: () => router.push({ pathname: '/add', params: { id: tx.id } }),
    onLongPress,
  };
  return (
    <>
      {historyLayout ? (
        <HistoryEntry {...row} hasMemo={Boolean(tx.memo?.trim())} kind={{ income: '収入', expense: '支出', transfer: '振替' }[tx.type]}
          stacked={historyLayout === 'stacked'} />
      ) : (
        <Row {...row} iconFilledInDark />
      )}
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
