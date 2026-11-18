import type { FinanceState, PurchaseCandidate, PurchaseStatus, Transaction } from '../types/finance';
import { getCategoryById } from '../data/categories';
import { shiftMonth } from './format';
import { filterLedger } from './ledgers';
import { computeMonthMetrics } from './metrics';

export interface InstallmentPlan {
  monthly: number;
  total: number;
  interest: number;
  /** Payment for each month (the last one absorbs rounding). */
  schedule: number[];
}

/** Equal monthly payments (annuity). A 0% rate splits the price evenly. */
export function installmentPlan(amount: number, count: number, annualRatePct: number): InstallmentPlan | undefined {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(count) || count < 1 || count > 120) return undefined;
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0 || annualRatePct > 100) return undefined;
  const r = annualRatePct / 100 / 12;
  const monthly = r === 0 ? Math.ceil(amount / count) : Math.ceil((amount * r) / (1 - Math.pow(1 + r, -count)));
  const total = r === 0 ? amount : monthly * count;
  const schedule = Array.from({ length: count }, () => monthly);
  if (r === 0) schedule[count - 1] = amount - monthly * (count - 1);
  return { monthly: schedule[0], total, interest: Math.max(0, total - amount), schedule };
}

/** Months until `price` is reachable; 0 = affordable now, undefined = never at this pace. */
export function monthsUntilAffordable(price: number, available: number, monthlySurplus: number): number | undefined {
  if (price <= available) return 0;
  if (monthlySurplus <= 0) return undefined;
  return Math.ceil((price - available) / monthlySurplus);
}

/** Average income - expense of the `months` full months before `month` (the current month is still in progress). */
export function averageMonthlyNet(state: FinanceState, month: string, months = 3, ledgerId?: string | null): number {
  const scoped = filterLedger(state, ledgerId ?? null);
  let sum = 0;
  for (let i = 1; i <= months; i++) sum += computeMonthMetrics(scoped, shiftMonth(month, -i)).net;
  return Math.round(sum / months);
}

export interface BudgetOverviewItem {
  categoryId: string;
  name: string;
  color: string;
  limit: number;
  spent: number;
  over: boolean;
}
export interface BudgetOverview {
  limit: number;
  spent: number;
  /** spent / limit (can exceed 1) */
  ratio: number;
  items: BudgetOverviewItem[];
  overCount: number;
}

/** How much of this month's budgets is used, optionally counting a planned purchase as spent in `extraCategoryId`. */
export function budgetOverview(
  state: FinanceState,
  month: string,
  ledgerId: string | null | undefined,
  extra?: { categoryId: string; amount: number } | { categoryId: string; amount: number }[]
): BudgetOverview {
  const metrics = computeMonthMetrics(filterLedger(state, ledgerId ?? null), month);
  const spentBy = new Map(metrics.categoryBreakdown.map((c) => [c.categoryId, c.amount]));
  const extras = extra === undefined ? [] : Array.isArray(extra) ? extra : [extra];
  const budgets = state.budgets.filter((b) => (b.ledgerId ?? undefined) === (ledgerId ?? undefined));
  const items = budgets.map((b) => {
    const cat = getCategoryById(b.categoryId, state.customCategories);
    const spent = (spentBy.get(b.categoryId) ?? 0) + extras.filter((e) => e.categoryId === b.categoryId).reduce((n, e) => n + e.amount, 0);
    return { categoryId: b.categoryId, name: cat.name, color: cat.color, limit: b.monthlyLimit, spent, over: spent > b.monthlyLimit };
  }).sort((a, b) => b.spent / (b.limit || 1) - a.spent / (a.limit || 1));
  const limit = items.reduce((s, i) => s + i.limit, 0);
  const spent = items.reduce((s, i) => s + i.spent, 0);
  return { limit, spent, ratio: limit > 0 ? spent / limit : 0, items, overCount: items.filter((i) => i.over).length };
}

export const PRIORITY_LABELS: Record<1 | 2 | 3, string> = { 1: '今すぐ', 2: 'そのうち', 3: 'いつか' };

/** Priority first, then the cheaper one. */
export function sortCandidates<T extends Pick<PurchaseCandidate, 'priority' | 'amount'>>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2) || a.amount - b.amount);
}

/** The expense recorded when a candidate is actually bought. */
export function buildPurchaseTransaction(c: PurchaseCandidate, accountId: string, date: string): Omit<Transaction, 'id'> {
  return {
    type: 'expense',
    amount: c.amount,
    date,
    categoryId: c.categoryId,
    accountId,
    title: c.title,
    memo: c.note || undefined,
    ledgerId: c.ledgerId,
  };
}

export function purchaseStatus(c: Pick<PurchaseCandidate, 'status'>): PurchaseStatus {
  return c.status ?? 'candidate';
}

/** Split by stage; candidates by priority, confirmed by planned date, purchased newest first. */
export function groupPurchases(items: PurchaseCandidate[]) {
  const by = (s: PurchaseStatus) => items.filter((i) => purchaseStatus(i) === s);
  return {
    candidates: sortCandidates(by('candidate')),
    confirmed: by('confirmed').sort((a, b) => (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999')),
    purchased: by('purchased').sort((a, b) => (b.purchasedAt ?? '').localeCompare(a.purchasedAt ?? '')),
  };
}

const without = ({ id: _id, ...rest }: PurchaseCandidate): Omit<PurchaseCandidate, 'id'> => rest;

/** Final check done: lock in price, date and paying account. */
export function confirmPurchase(c: PurchaseCandidate, f: { amount: number; plannedDate: string; accountId: string; installment?: PurchaseCandidate['installment'] }): Omit<PurchaseCandidate, 'id'> {
  return { ...without(c), status: 'confirmed', amount: f.amount, plannedDate: f.plannedDate, accountId: f.accountId, installment: f.installment, purchasedAt: undefined };
}

/** Back to the candidate list (the confirmation is dropped, the rest is kept). */
export function revertToCandidate(c: PurchaseCandidate): Omit<PurchaseCandidate, 'id'> {
  return { ...without(c), status: 'candidate', plannedDate: undefined, accountId: undefined, purchasedAt: undefined };
}

export function markPurchased(c: PurchaseCandidate, date: string): Omit<PurchaseCandidate, 'id'> {
  return { ...without(c), status: 'purchased', purchasedAt: date };
}
