import { Account, Transaction } from '../types/finance';
import { getEffectiveOutflow, shiftMonth } from './format';

export interface CreditCardStatementSummary {
  card: Account;
  currentMonthKey: string;
  nextMonthKey: string;
  thisMonthGross: number;
  thisMonthSettled: number;
  thisMonthRemaining: number;
  thisMonthConfirmed: boolean;
  thisMonthUsage: number;
  nextMonthGross: number;
  nextMonthPrepaid: number;
  nextMonthRemaining: number;
  nextMonthConfirmed: boolean;
  totalUnpaidBalance: number;
  totalPrepaidCredit: number;
  creditLimit: number;
  availableCredit: number;
  utilizationRatio: number;
  thisMonthTransactions: Transaction[];
  nextMonthTransactions: Transaction[];
}

function normalizeClosingDay(day: number) {
  const value = Number(day);
  return Number.isFinite(value) ? Math.max(1, Math.min(31, Math.floor(value))) : 31;
}

export function getBillingMonthForDate(
  dateStr: string,
  closingDay = 31,
  paymentMonthOffset: 1 | 2 = 1
): string {
  const monthKey = dateStr.slice(0, 7);
  const day = Number(dateStr.slice(8, 10)) || 1;
  const closingMonth =
    day <= normalizeClosingDay(closingDay) ? monthKey : shiftMonth(monthKey, 1);
  return shiftMonth(closingMonth, paymentMonthOffset);
}

export function getCycleRangeLabel(
  billingMonthKey: string,
  closingDay = 31,
  paymentMonthOffset: 1 | 2 = 1
): string {
  const closingMonth = shiftMonth(billingMonthKey, -paymentMonthOffset);
  const [year, month] = closingMonth.split('-').map(Number);
  const day = normalizeClosingDay(closingDay);
  const previousClose = Math.min(day, new Date(year, month - 1, 0).getDate());
  const start = new Date(year, month - 2, previousClose + 1);
  const end = Math.min(day, new Date(year, month, 0).getDate());
  return `${start.getMonth() + 1}/${start.getDate()} 〜 ${month}/${end} 利用分`;
}

/** Days to the calendar due date, when an unpaid statement is within its configured warning window. */
export function getPaymentWarning(summary: CreditCardStatementSummary, today: string, billingMonth?: string): number | null {
  const daysBefore = summary.card.paymentWarningDays ?? 0;
  if (daysBefore <= 0) return null;

  const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
  for (const [month, amount] of [
    [summary.currentMonthKey, summary.thisMonthRemaining],
    [summary.nextMonthKey, summary.nextMonthRemaining],
  ] as const) {
    if (amount <= 0 || (billingMonth && month !== billingMonth)) continue;
    const [year, m] = month.split('-').map(Number);
    const day = Math.min(summary.card.paymentDay ?? 27, new Date(year, m, 0).getDate());
    const due = toUtc(`${month}-${String(day).padStart(2, '0')}`);
    const days = (due - toUtc(today)) / 86_400_000;
    if (days >= 0 && days <= daysBefore) return days;
  }
  return null;
}

type BillingCycle = { total: number; purchases: Transaction[]; sorted: boolean };
type CardActivity = {
  cycles: Map<string, BillingCycle>;
  usage: Map<string, number>;
  payments: Map<string, number>;
  unallocated: Map<string, number>;
  prepaidTotal: number;
};

const cardHistory = new WeakMap<readonly Transaction[], {
  byAccount: Map<string, Transaction[]>;
  activity: Map<string, { closingDay: number; offset: number; value: CardActivity }>;
}>();

function activityForCard(card: Account, transactions: readonly Transaction[]): CardActivity {
  let history = cardHistory.get(transactions);
  if (!history) {
    history = { byAccount: new Map(), activity: new Map() };
    for (const tx of transactions) {
      const id = tx.type === 'expense' ? tx.accountId : tx.type === 'transfer' ? tx.toAccountId : undefined;
      if (id === undefined) continue;
      const bucket = history.byAccount.get(id);
      if (bucket) bucket.push(tx);
      else history.byAccount.set(id, [tx]);
    }
    cardHistory.set(transactions, history);
  }

  const closingDay = card.closingDay ?? 31;
  const offset = card.paymentMonthOffset ?? 1;
  const cached = history.activity.get(card.id);
  if (cached?.closingDay === closingDay && cached.offset === offset) return cached.value;

  const result: CardActivity = { cycles: new Map(), usage: new Map(), payments: new Map(), unallocated: new Map(), prepaidTotal: 0 };
  const monthsByDate = new Map<string, string>();
  const add = (map: Map<string, number>, key: string, amount: number) => {
    map.set(key, (map.get(key) ?? 0) + amount);
  };
  for (const tx of history.byAccount.get(card.id) ?? []) {
    const month = tx.date.slice(0, 7);
    if (tx.type === 'expense') {
      const charge = getEffectiveOutflow(tx);
      add(result.usage, month, charge);
      let billingMonth = monthsByDate.get(tx.date);
      if (billingMonth === undefined) {
        billingMonth = getBillingMonthForDate(tx.date, closingDay, offset);
        monthsByDate.set(tx.date, billingMonth);
      }
      const cycle = result.cycles.get(billingMonth);
      if (cycle) {
        cycle.total += charge;
        cycle.purchases.push(tx);
      } else {
        result.cycles.set(billingMonth, { total: charge, purchases: [tx], sorted: false });
      }
    } else {
      if (tx.isPrepayment) result.prepaidTotal += tx.amount;
      if (tx.targetBillingMonth) add(result.payments, tx.targetBillingMonth, tx.amount);
      else add(result.unallocated, month, tx.amount);
    }
  }
  history.activity.set(card.id, { closingDay, offset, value: result });
  return result;
}

function purchasesForCycle(cycle?: BillingCycle): Transaction[] {
  if (!cycle) return [];
  if (!cycle.sorted) {
    cycle.purchases.sort((a, b) => b.date.localeCompare(a.date));
    cycle.sorted = true;
  }
  return cycle.purchases.slice();
}

function settledInMonth(activity: CardActivity, month: string): number {
  return (activity.payments.get(month) ?? 0) + (activity.unallocated.get(month) ?? 0);
}

export function computeCreditCardSummary(
  card: Account,
  transactions: readonly Transaction[],
  accountBalance: number,
  referenceMonthKey: string
): CreditCardStatementSummary {
  const activity = activityForCard(card, transactions);
  const nextMonthKey = shiftMonth(referenceMonthKey, 1);
  const currentCycle = activity.cycles.get(referenceMonthKey);
  const nextCycle = activity.cycles.get(nextMonthKey);
  const prepaidNextMonth = activity.payments.get(nextMonthKey) ?? 0;

  const currentConfirmed = confirmedAmount(card.confirmedBillings?.[referenceMonthKey]);
  const nextConfirmed = confirmedAmount(card.confirmedBillings?.[nextMonthKey]);
  const thisMonthGross = currentConfirmed ?? currentCycle?.total ?? 0;
  const nextMonthGross = nextConfirmed ?? nextCycle?.total ?? 0;
  const totalSettledThisMonth = settledInMonth(activity, referenceMonthKey);
  const thisMonthRemaining = Math.max(0, thisMonthGross - totalSettledThisMonth);
  const nextMonthRemaining = Math.max(0, nextMonthGross - prepaidNextMonth);

  // Unpaid debt derived from account balance (negative balance = debt owed)
  const totalUnpaidBalance = Math.max(0, -accountBalance);
  const creditLimit = card.creditLimit ?? 0;
  const availableCredit =
    creditLimit > 0 ? Math.max(0, creditLimit - totalUnpaidBalance) : 0;
  const utilizationRatio =
    creditLimit > 0 ? totalUnpaidBalance / creditLimit : 0;

  return {
    card,
    currentMonthKey: referenceMonthKey,
    nextMonthKey,
    thisMonthGross,
    thisMonthSettled: totalSettledThisMonth,
    thisMonthRemaining,
    thisMonthConfirmed: currentConfirmed !== undefined,
    thisMonthUsage: activity.usage.get(referenceMonthKey) ?? 0,
    nextMonthGross,
    nextMonthPrepaid: prepaidNextMonth,
    nextMonthRemaining,
    nextMonthConfirmed: nextConfirmed !== undefined,
    totalUnpaidBalance,
    totalPrepaidCredit: activity.prepaidTotal,
    creditLimit,
    availableCredit,
    utilizationRatio,
    thisMonthTransactions: purchasesForCycle(currentCycle),
    nextMonthTransactions: purchasesForCycle(nextCycle),
  };
}

function confirmedAmount(amount: number | undefined): number | undefined {
  return amount !== undefined && Number.isSafeInteger(amount) && amount >= 0 ? amount : undefined;
}

/** A confirmed statement replaces the estimate for its month. Posted payments reduce either amount. */
export function getCardWithdrawal(card: Account, transactions: Transaction[], month: string) {
  const statement = computeCreditCardSummary(card, transactions, 0, month);
  return {
    confirmed: statement.thisMonthConfirmed,
    remaining: statement.thisMonthRemaining,
  };
}

export function getBankCardWithdrawals(cards: Account[], posted: Transaction[], bankId: string, currentMonth: string, throughMonth: string) {
  let confirmed = 0;
  let estimated = 0;
  for (const card of cards) {
    if (card.type !== 'credit' || card.linkedBankAccountId !== bankId) continue;
    const months = new Set(Object.keys(card.confirmedBillings ?? {}).filter((month) =>
      /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= throughMonth));
    const activity = activityForCard(card, posted);
    for (const month of activity.cycles.keys()) {
      if (month >= currentMonth && month <= throughMonth) months.add(month);
    }
    for (const month of months) {
      const actual = confirmedAmount(card.confirmedBillings?.[month]);
      const gross = actual ?? activity.cycles.get(month)?.total ?? 0;
      const remaining = Math.max(0, gross - settledInMonth(activity, month));
      if (actual !== undefined) confirmed += remaining;
      else if (month >= currentMonth) estimated += remaining;
    }
  }
  return { confirmed, estimated };
}
