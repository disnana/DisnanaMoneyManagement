import type { FinanceState, ForeignPurchasePrice, SavingsGoal } from '../types/finance';
import { filterLedger } from './ledgers';
import { computeMonthMetrics } from './metrics';

export const FOREIGN_PURCHASE_CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD'] as const;

export function estimatePurchaseJPY(price: ForeignPurchasePrice): number | undefined {
  if (!FOREIGN_PURCHASE_CURRENCIES.includes(price.currency) ||
    !Number.isFinite(price.amount) || price.amount <= 0 ||
    !Number.isFinite(price.yenPerUnit) || price.yenPerUnit <= 0 ||
    !Number.isSafeInteger(price.feeJPY) || price.feeJPY < 0) return undefined;
  const total = Math.round(price.amount * price.yenPerUnit) + price.feeJPY;
  return Number.isSafeInteger(total) && total > 0 ? total : undefined;
}

export function assessPurchase(limit: number | undefined, spent: number, amount: number) {
  if (limit === undefined) return undefined;
  const available = Math.max(0, limit - spent);
  const remaining = limit - spent - amount;
  return { available, remaining, shortfall: Math.max(0, -remaining) };
}

export function assessPurchaseForMonth(state: FinanceState, month: string, categoryId: string, amount: number, ledgerId?: string) {
  const budget = state.budgets.find((entry) => entry.ledgerId === ledgerId && entry.categoryId === categoryId);
  if (!budget) return undefined;
  const metrics = computeMonthMetrics(filterLedger(state, ledgerId ?? null), month);
  return assessPurchase(budget.monthlyLimit, metrics.categoryBreakdown.find((item) => item.categoryId === categoryId)?.amount ?? 0, amount);
}

export function comparePurchaseCash(balance: number, cardWithdrawals: number, price: number,
  contribution: number, savings: { available: number; sameAccount: boolean }) {
  const bankRemaining = balance - cardWithdrawals - price;
  const reserved = savings.sameAccount ? savings.available : 0;
  const free = bankRemaining - contribution - reserved;
  const gap = Math.max(0, -free);
  const savingsUsed = Math.min(gap, savings.available);
  const contributionCut = Math.min(gap, contribution);
  return {
    bankRemaining,
    free,
    savingsUsed,
    afterSavings: free + savingsUsed,
    contributionCut,
    afterContributionCut: free + contributionCut,
  };
}

export function isPlanningDate(date: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function planSavings(goal: SavingsGoal, today: string) {
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const contribution = goal.monthlyContribution ?? 0;
  const target = goal.targetDate && isPlanningDate(goal.targetDate) ? goal.targetDate : undefined;
  const [nowYear, nowMonth] = today.split('-').map(Number);
  const [targetYear, targetMonth] = (target ?? today).split('-').map(Number);
  const months = (targetYear - nowYear) * 12 + targetMonth - nowMonth + 1;
  const overdue = remaining > 0 && target !== undefined && target < today;
  const monthlyRequired = target && target >= today ? Math.ceil(remaining / months) : undefined;
  return {
    remaining,
    overdue,
    monthlyRequired,
    monthlyShortfall: monthlyRequired === undefined ? undefined : Math.max(0, monthlyRequired - contribution),
    monthsToGoal: remaining === 0 ? 0 : contribution > 0 ? Math.ceil(remaining / contribution) : undefined,
  };
}
