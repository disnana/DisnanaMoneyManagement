import type { Transaction } from '../types/finance';
import { getCategoryById } from '../data/categories';
import { getDeductibleBusinessAmount, getTransferTotalFees } from './format';
import { isOwnFlow } from './advances';

export interface TaxSummary {
  totalIncome: number;
  totalWithholding: number;
  /** 事業所得 + 雑所得 の収入 */
  businessAndMiscIncome: number;
  totalDeductibleExpense: number;
  estimatedBusinessNet: number;
  incomeByTaxCategory: { key: string; amount: number; count: number; withholding: number }[];
  expenseBySubject: { subject: string; gross: number; deductible: number; count: number }[];
}

/** Annual tax figures from the given transactions (same rules as the web Tax view). */
export function computeTaxSummary(transactions: Transaction[]): TaxSummary {
  let totalIncome = 0;
  let totalWithholding = 0;
  let businessAndMiscIncome = 0;
  let totalDeductibleExpense = 0;
  const income: Record<string, { amount: number; count: number; withholding: number }> = {};
  const subjects: Record<string, { gross: number; deductible: number; count: number }> = {};

  const addSubject = (subject: string, gross: number, deductible: number) => {
    const s = (subjects[subject] ??= { gross: 0, deductible: 0, count: 0 });
    s.gross += gross;
    s.deductible += deductible;
    s.count += 1;
  };

  for (const tx of transactions) {
    if (!isOwnFlow(tx)) continue;
    if (tx.type === 'income') {
      totalIncome += tx.amount;
      totalWithholding += tx.withholdingTax ?? 0;
      const key = tx.incomeTaxCategory ?? 'miscellaneous';
      const c = (income[key] ??= { amount: 0, count: 0, withholding: 0 });
      c.amount += tx.amount;
      c.count += 1;
      c.withholding += tx.withholdingTax ?? 0;
      if (key === 'business' || key === 'miscellaneous') businessAndMiscIncome += tx.amount;
    } else if (tx.type === 'expense') {
      const deductible = getDeductibleBusinessAmount(tx);
      if (deductible > 0 || tx.scope === 'business') {
        totalDeductibleExpense += deductible;
        addSubject(tx.accountingSubject ?? getCategoryById(tx.categoryId).defaultAccountingSubject ?? '雑費', tx.amount, deductible);
      }
    } else if (tx.type === 'transfer' && tx.scope === 'business') {
      const fee = getTransferTotalFees(tx);
      if (fee > 0) {
        totalDeductibleExpense += fee;
        addSubject('支払手数料', fee, fee);
      }
    }
  }

  return {
    totalIncome,
    totalWithholding,
    businessAndMiscIncome,
    totalDeductibleExpense,
    estimatedBusinessNet: businessAndMiscIncome - totalDeductibleExpense,
    incomeByTaxCategory: Object.entries(income)
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.amount - a.amount),
    expenseBySubject: Object.entries(subjects)
      .map(([subject, v]) => ({ subject, ...v }))
      .sort((a, b) => b.deductible - a.deductible),
  };
}
