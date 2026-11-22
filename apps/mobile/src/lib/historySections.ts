import type { Transaction } from '@dmm/core/types/finance';
import { formatJPY } from '@dmm/core/utils/format';
import { groupTransactionsByDate } from '@dmm/core/utils/metrics';

export function historySections(transactions: readonly Transaction[], limit = Infinity) {
  const sections = [];
  let remaining = limit;
  for (const { date, net, items } of groupTransactionsByDate(transactions)) {
    if (remaining <= 0) break;
    // A swipe preview can stop halfway through a day. Its heading still shows the whole day's cash flow.
    const data = items.length > remaining ? items.slice(0, remaining) : items;
    sections.push({ key: date, date, net, data });
    remaining -= data.length;
  }
  return sections;
}

export function historyAmount(tx: Pick<Transaction, 'type' | 'amount'>) {
  const value = tx.type === 'expense' ? -tx.amount : tx.amount;
  return (tx.type !== 'transfer' && value > 0 ? '+' : '') + formatJPY(value);
}
