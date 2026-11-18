import type { Transaction } from '../types/finance';

/** An expense paid on someone else's behalf (to be paid back). */
export function isAdvance(tx: Transaction): boolean {
  return tx.type === 'expense' && Boolean(tx.advance);
}

/** The income that pays an advance back. */
export function isReimbursement(tx: Transaction): boolean {
  return tx.type === 'income' && Boolean(tx.reimbursementOf);
}

/** Money that really is the user's own income/expense (advances and their payback are pass-through). */
export function isOwnFlow(tx: Transaction): boolean {
  return !isAdvance(tx) && !isReimbursement(tx);
}

export function getPendingAdvances(txs: Transaction[]): Transaction[] {
  return txs
    .filter((t) => isAdvance(t) && !t.advance?.reimbursedAt)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Total still to be collected, by person. */
export function pendingAdvanceTotals(txs: Transaction[]): { name: string; amount: number }[] {
  const by = new Map<string, number>();
  for (const t of getPendingAdvances(txs)) {
    const name = t.advance?.for?.trim() || '未設定';
    by.set(name, (by.get(name) ?? 0) + t.amount);
  }
  return [...by.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}

/** The income transaction recorded when an advance is paid back. */
export function buildReimbursementTx(advance: Transaction, accountId: string, date: string): Omit<Transaction, 'id'> {
  return {
    type: 'income',
    amount: advance.amount,
    date,
    categoryId: 'other_income',
    accountId,
    title: `立替の回収: ${advance.title}`,
    memo: advance.advance?.for ? `${advance.advance.for}から` : undefined,
    scope: 'personal',
    ...(advance.ledgerId ? { ledgerId: advance.ledgerId } : {}),
    reimbursementOf: advance.id,
  };
}
