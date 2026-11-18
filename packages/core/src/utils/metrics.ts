import type { FinanceState, Transaction } from '../types/finance';
import { getCategoryById } from '../data/categories';
import { getTransferTotalFees } from './format';
import { isOwnFlow } from './advances';

export interface MonthMetrics {
  income: number;
  expense: number;
  net: number;
  categoryBreakdown: { categoryId: string; name: string; color: string; amount: number; share: number }[];
}

/** Income / expense (transfer fees count as expense) and expense-by-category for one month. */
export function computeMonthMetrics(state: FinanceState, monthKey: string): MonthMetrics {
  let income = 0;
  let expense = 0;
  const byCat: Record<string, number> = {};
  for (const tx of state.transactions) {
    if (tx.date.slice(0, 7) !== monthKey) continue;
    if (!isOwnFlow(tx)) continue; // 立替とその回収は自分の収支ではない
    if (tx.type === 'income') income += tx.amount;
    else if (tx.type === 'expense') {
      expense += tx.amount;
      byCat[tx.categoryId] = (byCat[tx.categoryId] ?? 0) + tx.amount;
    } else {
      const fee = getTransferTotalFees(tx);
      if (fee > 0) {
        expense += fee;
        byCat.transfer_fee = (byCat.transfer_fee ?? 0) + fee;
      }
    }
  }
  const categoryBreakdown = Object.entries(byCat)
    .map(([categoryId, amount]) => {
      const cat =
        categoryId === 'transfer_fee'
          ? { name: '振替・振込手数料', color: '#64748B' }
          : getCategoryById(categoryId);
      return { categoryId, name: cat.name, color: cat.color, amount, share: expense > 0 ? amount / expense : 0 };
    })
    .sort((a, b) => b.amount - a.amount);
  return { income, expense, net: income - expense, categoryBreakdown };
}

export interface DayGroup {
  date: string;
  items: Transaction[];
  net: number;
}

/** Newest first, grouped by date, with each day's net (income - expense). */
export function groupTransactionsByDate(txs: Transaction[]): DayGroup[] {
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  const groups: DayGroup[] = [];
  for (const tx of sorted) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== tx.date) {
      g = { date: tx.date, items: [], net: 0 };
      groups.push(g);
    }
    g.items.push(tx);
    if (tx.type === 'income') g.net += tx.amount;
    else if (tx.type === 'expense') g.net -= tx.amount;
  }
  return groups;
}
