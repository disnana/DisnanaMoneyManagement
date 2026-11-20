import type { FinanceState, Transaction } from '../types/finance';
import { getCategoryById } from '../data/categories';
import { getTransferTotalFees } from './format';
import { isOwnFlow } from './advances';

type CategoryBreakdown = { categoryId: string; name: string; color: string; amount: number; share: number }[];

export interface MonthMetrics {
  income: number;
  expense: number;
  net: number;
  categoryBreakdown: CategoryBreakdown;
  incomeCategoryBreakdown: CategoryBreakdown;
}

// Finance updates replace the transaction array. Share its month index across screens and previews.
const monthIndexes = new WeakMap<readonly Transaction[], Map<string, Transaction[]>>();
const emptyMonth: readonly Transaction[] = [];

export function getMonthTransactions(transactions: readonly Transaction[], monthKey: string): readonly Transaction[] {
  let index = monthIndexes.get(transactions);
  if (!index) {
    index = new Map();
    for (const transaction of transactions) {
      const month = transaction.date.slice(0, 7);
      const bucket = index.get(month);
      if (bucket) bucket.push(transaction);
      else index.set(month, [transaction]);
    }
    monthIndexes.set(transactions, index);
  }
  return index.get(monthKey) ?? emptyMonth;
}

type CashFlow = Pick<MonthMetrics, 'income' | 'expense' | 'net'>;
type CategoryAmounts = { income: Map<string, number>; expense: Map<string, number> };

function addCashFlow(totals: CashFlow, tx: Transaction, categories?: CategoryAmounts) {
  if (!isOwnFlow(tx)) return;
  const transfer = tx.type === 'transfer';
  const amount = transfer ? getTransferTotalFees(tx) : tx.amount;
  if (transfer && amount <= 0) return;
  const side = tx.type === 'income' ? 'income' : 'expense';
  totals[side] += amount;
  totals.net = totals.income - totals.expense;
  if (categories) {
    const category = transfer ? 'transfer_fee' : tx.categoryId;
    const amounts = categories[side];
    amounts.set(category, (amounts.get(category) ?? 0) + amount);
  }
}

/** Household income and expense for any selection of transactions. */
export function computeCashFlow(transactions: readonly Transaction[]): CashFlow {
  const totals = { income: 0, expense: 0, net: 0 };
  for (const tx of transactions) addCashFlow(totals, tx);
  return totals;
}

const monthAggregates = new WeakMap<readonly Transaction[], { totals: CashFlow; categories: CategoryAmounts }>();

function getMonthAggregate(transactions: readonly Transaction[], monthKey: string) {
  const rows = getMonthTransactions(transactions, monthKey);
  const saved = monthAggregates.get(rows);
  if (saved) return saved;
  const totals = { income: 0, expense: 0, net: 0 };
  const categories = { income: new Map<string, number>(), expense: new Map<string, number>() };
  for (const tx of rows) addCashFlow(totals, tx, categories);
  const aggregate = { totals, categories };
  monthAggregates.set(rows, aggregate);
  return aggregate;
}

export function computeMonthCashFlow(state: Pick<FinanceState, 'transactions'>, monthKey: string): Readonly<CashFlow> {
  return getMonthAggregate(state.transactions, monthKey).totals;
}

/** Income / expense (transfer fees count as expense) and category breakdowns for one month. */
export function computeMonthMetrics(state: Pick<FinanceState, 'transactions' | 'customCategories'>, monthKey: string): MonthMetrics {
  const { totals, categories } = getMonthAggregate(state.transactions, monthKey);
  const breakdown = (amounts: Map<string, number>, total: number): CategoryBreakdown => [...amounts]
    .map(([categoryId, amount]) => {
      const cat =
        categoryId === 'transfer_fee'
          ? { name: '振替・振込手数料', color: '#64748B' }
          : getCategoryById(categoryId, state.customCategories);
      return { categoryId, name: cat.name, color: cat.color, amount, share: total > 0 ? amount / total : 0 };
    })
    .sort((a, b) => b.amount - a.amount);
  return {
    ...totals,
    categoryBreakdown: breakdown(categories.expense, totals.expense),
    incomeCategoryBreakdown: breakdown(categories.income, totals.income),
  };
}

export interface DayGroup extends CashFlow {
  date: string;
  items: Transaction[];
  transfer: number;
}

export function indexTransactionsByDate(txs: readonly Transaction[]): Map<string, DayGroup> {
  const groups = new Map<string, DayGroup>();
  for (const tx of txs) {
    let group = groups.get(tx.date);
    if (!group) {
      group = { date: tx.date, items: [], income: 0, expense: 0, net: 0, transfer: 0 };
      groups.set(tx.date, group);
    }
    group.items.push(tx);
    addCashFlow(group, tx);
    if (tx.type === 'transfer') group.transfer += tx.amount;
  }
  return groups;
}

/** Newest first; keep all entries visible, including pass-through payments. */
export function groupTransactionsByDate(txs: readonly Transaction[]): DayGroup[] {
  return [...indexTransactionsByDate(txs).values()].sort((a, b) => b.date.localeCompare(a.date));
}
