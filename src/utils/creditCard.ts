import { Account, Transaction } from '../types/finance';
import { getEffectiveOutflow, shiftMonth } from './format';

export interface CreditCardStatementSummary {
  card: Account;
  currentMonthKey: string;
  nextMonthKey: string;
  thisMonthGross: number;
  thisMonthSettled: number;
  thisMonthRemaining: number;
  nextMonthGross: number;
  nextMonthPrepaid: number;
  nextMonthRemaining: number;
  totalUnpaidBalance: number;
  totalPrepaidCredit: number;
  creditLimit: number;
  availableCredit: number;
  utilizationRatio: number;
  thisMonthTransactions: Transaction[];
  nextMonthTransactions: Transaction[];
}

export function getBillingMonthForDate(
  dateStr: string,
  closingDay = 31,
  paymentMonthOffset: 1 | 2 = 1
): string {
  const monthKey = dateStr.slice(0, 7);
  const day = Number(dateStr.slice(8, 10)) || 1;
  const effectiveClosing = closingDay >= 31 ? 31 : Math.max(1, closingDay);
  const closingMonth =
    day <= effectiveClosing ? monthKey : shiftMonth(monthKey, 1);
  return shiftMonth(closingMonth, paymentMonthOffset);
}

export function getCycleRangeLabel(
  billingMonthKey: string,
  closingDay = 31,
  paymentMonthOffset: 1 | 2 = 1
): string {
  const closingMonth = shiftMonth(billingMonthKey, -paymentMonthOffset);
  const [cy, cm] = closingMonth.split('-').map(Number);

  if (closingDay >= 31) {
    const lastDay = new Date(cy, cm, 0).getDate();
    return `${cm}/1 〜 ${cm}/${lastDay} 利用分`;
  }

  const prevMonth = shiftMonth(closingMonth, -1);
  const [, pm] = prevMonth.split('-').map(Number);
  return `${pm}/${closingDay + 1} 〜 ${cm}/${closingDay} 利用分`;
}

export function computeCreditCardSummary(
  card: Account,
  transactions: Transaction[],
  accountBalance: number,
  referenceMonthKey: string
): CreditCardStatementSummary {
  const closingDay = card.closingDay ?? 31;
  const offset = card.paymentMonthOffset ?? 1;
  const nextMonthKey = shiftMonth(referenceMonthKey, 1);

  const thisMonthTransactions: Transaction[] = [];
  const nextMonthTransactions: Transaction[] = [];

  let thisMonthGross = 0;
  let nextMonthGross = 0;

  let settledThisMonth = 0;
  let prepaidNextMonth = 0;
  let unallocatedPayments = 0;
  let totalPrepaidCredit = 0;

  for (const tx of transactions) {
    if (tx.type === 'expense' && tx.accountId === card.id) {
      const charge = getEffectiveOutflow(tx);
      const billingMonth = getBillingMonthForDate(tx.date, closingDay, offset);
      if (billingMonth === referenceMonthKey) {
        thisMonthGross += charge;
        thisMonthTransactions.push(tx);
      } else if (billingMonth === nextMonthKey) {
        nextMonthGross += charge;
        nextMonthTransactions.push(tx);
      }
    } else if (tx.type === 'transfer' && tx.toAccountId === card.id) {
      if (tx.isPrepayment) {
        totalPrepaidCredit += tx.amount;
      }
      if (tx.targetBillingMonth === referenceMonthKey) {
        settledThisMonth += tx.amount;
      } else if (tx.targetBillingMonth === nextMonthKey) {
        prepaidNextMonth += tx.amount;
      } else if (!tx.targetBillingMonth) {
        // Transfers without a target month still count against current/earliest billing if in that month
        if (tx.date.slice(0, 7) === referenceMonthKey) {
          unallocatedPayments += tx.amount;
        }
      }
    }
  }

  const totalSettledThisMonth = settledThisMonth + unallocatedPayments;
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
    nextMonthGross,
    nextMonthPrepaid: prepaidNextMonth,
    nextMonthRemaining,
    totalUnpaidBalance,
    totalPrepaidCredit,
    creditLimit,
    availableCredit,
    utilizationRatio,
    thisMonthTransactions: thisMonthTransactions.sort((a, b) =>
      b.date.localeCompare(a.date)
    ),
    nextMonthTransactions: nextMonthTransactions.sort((a, b) =>
      b.date.localeCompare(a.date)
    ),
  };
}
