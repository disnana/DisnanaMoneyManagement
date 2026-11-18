import React, { useMemo, useState } from 'react';
import { Download, Plus, AlertCircle, ChevronRight } from 'lucide-react';
import { Account, Transaction } from '../types/finance';
import {
  INCOME_TAX_CATEGORY_LABELS,
  RECEIPT_METHOD_LABELS,
  getCategoryById,
} from '../data/categories';
import {
  exportTransactionsToCSV,
  formatFullDate,
  formatJPY,
  getDeductibleBusinessAmount,
} from '../utils/format';

interface TaxViewProps {
  transactions: Transaction[];
  accounts: Account[];
  accountNameMap: Record<string, string>;
  onOpenAddBusinessExpense: () => void;
  onOpenAddIncome: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

export const TaxView: React.FC<TaxViewProps> = ({
  transactions,
  accountNameMap,
  onOpenAddBusinessExpense,
  onOpenAddIncome,
  onEditTransaction,
}) => {
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    for (const tx of transactions) {
      set.add(tx.date.slice(0, 4));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const [selectedYear, setSelectedYear] = useState<string>(
    availableYears[0] ?? '2026'
  );

  const yearTransactions = useMemo(
    () => transactions.filter((tx) => tx.date.slice(0, 4) === selectedYear),
    [transactions, selectedYear]
  );

  const taxSummary = useMemo(() => {
    let totalIncome = 0;
    let totalWithholding = 0;
    let businessAndMiscIncome = 0;
    let miscIncomeOnly = 0;
    let totalDeductibleExpense = 0;

    const incomeByTaxCategory: Record<string, { amount: number; count: number; withholding: number }> = {};
    const incomeByReceiptMethod: Record<string, { amount: number; count: number }> = {};
    const expenseBySubject: Record<string, { gross: number; deductible: number; count: number }> = {};

    const giftAndMiscList: Transaction[] = [];
    const businessExpenseList: Transaction[] = [];

    for (const tx of yearTransactions) {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
        totalWithholding += tx.withholdingTax ?? 0;

        const taxCat = tx.incomeTaxCategory ?? 'miscellaneous';
        if (!incomeByTaxCategory[taxCat]) {
          incomeByTaxCategory[taxCat] = { amount: 0, count: 0, withholding: 0 };
        }
        incomeByTaxCategory[taxCat].amount += tx.amount;
        incomeByTaxCategory[taxCat].count += 1;
        incomeByTaxCategory[taxCat].withholding += tx.withholdingTax ?? 0;

        if (taxCat === 'business' || taxCat === 'miscellaneous') {
          businessAndMiscIncome += tx.amount;
        }
        if (taxCat === 'miscellaneous') {
          miscIncomeOnly += tx.amount;
        }

        const method = tx.receiptMethod ?? 'bank_transfer';
        if (!incomeByReceiptMethod[method]) {
          incomeByReceiptMethod[method] = { amount: 0, count: 0 };
        }
        incomeByReceiptMethod[method].amount += tx.amount;
        incomeByReceiptMethod[method].count += 1;

        if (
          taxCat === 'miscellaneous' ||
          taxCat === 'business' ||
          method === 'amazon_gift' ||
          method === 'other_gift' ||
          method === 'points'
        ) {
          giftAndMiscList.push(tx);
        }
      } else if (tx.type === 'expense') {
        const deductible = getDeductibleBusinessAmount(tx);
        if (deductible > 0 || tx.scope === 'business') {
          totalDeductibleExpense += deductible;
          const subj =
            tx.accountingSubject ??
            getCategoryById(tx.categoryId).defaultAccountingSubject ??
            '雑費';
          if (!expenseBySubject[subj]) {
            expenseBySubject[subj] = { gross: 0, deductible: 0, count: 0 };
          }
          expenseBySubject[subj].gross += tx.amount;
          expenseBySubject[subj].deductible += deductible;
          expenseBySubject[subj].count += 1;
          businessExpenseList.push(tx);
        }
      } else if (
        tx.type === 'transfer' &&
        (tx.transferFee ?? 0) > 0 &&
        tx.scope === 'business'
      ) {
        const fee = tx.transferFee ?? 0;
        totalDeductibleExpense += fee;
        if (!expenseBySubject['支払手数料']) {
          expenseBySubject['支払手数料'] = { gross: 0, deductible: 0, count: 0 };
        }
        expenseBySubject['支払手数料'].gross += fee;
        expenseBySubject['支払手数料'].deductible += fee;
        expenseBySubject['支払手数料'].count += 1;
        businessExpenseList.push(tx);
      }
    }

    const estimatedBusinessNet = Math.max(
      0,
      businessAndMiscIncome - totalDeductibleExpense
    );

    return {
      totalIncome,
      totalWithholding,
      businessAndMiscIncome,
      miscIncomeOnly,
      totalDeductibleExpense,
      estimatedBusinessNet,
      incomeByTaxCategory: Object.entries(incomeByTaxCategory).sort(
        (a, b) => b[1].amount - a[1].amount
      ),
      incomeByReceiptMethod: Object.entries(incomeByReceiptMethod).sort(
        (a, b) => b[1].amount - a[1].amount
      ),
      expenseBySubject: Object.entries(expenseBySubject).sort(
        (a, b) => b[1].deductible - a[1].deductible
      ),
      giftAndMiscList: giftAndMiscList.sort((a, b) => b.date.localeCompare(a.date)),
      businessExpenseList: businessExpenseList.sort((a, b) =>
        b.date.localeCompare(a.date)
      ),
    };
  }, [yearTransactions]);

  const handleExportTaxCsv = () => {
    const relevant = yearTransactions
      .filter(
        (tx) =>
          tx.type === 'income' ||
          tx.scope === 'business' ||
          getDeductibleBusinessAmount(tx) > 0
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    exportTransactionsToCSV(
      relevant,
      accountNameMap,
      `dmm-tax-${selectedYear}.csv`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            経費・所得・確定申告サポート
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
            Amazonギフト券等の現物収入・雑所得の集計と、家事按分を反映した事業経費を確認できます
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2.5">
            <select
              aria-label="対象年を選択"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs font-semibold text-slate-800"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}年分
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportTaxCsv}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>確定申告用CSV</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2.5">
            <button
              type="button"
              onClick={onOpenAddIncome}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>報酬・ギフト記録</span>
            </button>

            <button
              type="button"
              onClick={onOpenAddBusinessExpense}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white transition-all hover:bg-teal-800 active:scale-[0.98] whitespace-nowrap"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>事業経費を登録</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <section className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">
            {selectedYear}年 総収入額
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatJPY(taxSummary.totalIncome)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            うち源泉徴収済 {formatJPY(taxSummary.totalWithholding)}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">
            事業・雑所得 収入計
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {formatJPY(taxSummary.businessAndMiscIncome)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            うち雑所得 {formatJPY(taxSummary.miscIncomeOnly)}
          </div>
        </div>

        <div className="p-5 sm:border-t sm:border-slate-200 lg:border-t-0">
          <div className="text-xs font-medium text-slate-500">
            算入経費合計（按分後）
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatJPY(taxSummary.totalDeductibleExpense)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            勘定科目 {taxSummary.expenseBySubject.length}科目
          </div>
        </div>

        <div className="p-5 sm:border-t sm:border-slate-200 lg:border-t-0">
          <div className="text-xs font-medium text-slate-500">
            事業・雑 差引所得（目安）
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-teal-800 tabular-nums">
            {formatJPY(taxSummary.estimatedBusinessNet)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            {taxSummary.estimatedBusinessNet >= 200000 ? (
              <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" />
                20万円超（確定申告要確認）
              </span>
            ) : (
              <span>副業20万円基準の目安内</span>
            )}
          </div>
        </div>
      </section>

      {/* Income Tax & Receipt Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900">所得区分別 収入集計</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            給与所得・事業所得・雑所得などの税務区分ごとの合計
          </p>

          {/* Mobile Stacked List */}
          <div className="mt-4 divide-y divide-slate-100 md:hidden">
            {taxSummary.incomeByTaxCategory.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">収入データがありません</p>
            ) : (
              taxSummary.incomeByTaxCategory.map(([key, data]) => (
                <div key={key} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      {INCOME_TAX_CATEGORY_LABELS[
                        key as keyof typeof INCOME_TAX_CATEGORY_LABELS
                      ] ?? key}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                      {data.count}件 · 源泉徴収 {formatJPY(data.withholding)}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                    {formatJPY(data.amount)}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">所得区分</th>
                  <th className="py-2 px-3 text-right font-medium whitespace-nowrap">件数</th>
                  <th className="py-2 px-3 text-right font-medium whitespace-nowrap">源泉徴収</th>
                  <th className="py-2 pl-3 text-right font-medium whitespace-nowrap">金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {taxSummary.incomeByTaxCategory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-slate-400">
                      収入データがありません
                    </td>
                  </tr>
                ) : (
                  taxSummary.incomeByTaxCategory.map(([key, data]) => (
                    <tr key={key}>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">
                        {INCOME_TAX_CATEGORY_LABELS[
                          key as keyof typeof INCOME_TAX_CATEGORY_LABELS
                        ] ?? key}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {data.count}件
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {formatJPY(data.withholding)}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                        {formatJPY(data.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900">
            受取形態別 集計（ギフト券・現物含む）
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            現金・振込以外のAmazonギフト券やポイント付与も税務上漏れなく把握できます
          </p>

          {/* Mobile Stacked List */}
          <div className="mt-4 divide-y divide-slate-100 md:hidden">
            {taxSummary.incomeByReceiptMethod.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">データがありません</p>
            ) : (
              taxSummary.incomeByReceiptMethod.map(([method, data]) => (
                <div key={method} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      {RECEIPT_METHOD_LABELS[
                        method as keyof typeof RECEIPT_METHOD_LABELS
                      ] ?? method}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                      {data.count}件
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {formatJPY(data.amount)}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 font-medium">受取形態</th>
                  <th className="py-2 text-right font-medium">件数</th>
                  <th className="py-2 text-right font-medium">総額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {taxSummary.incomeByReceiptMethod.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-xs text-slate-400">
                      データがありません
                    </td>
                  </tr>
                ) : (
                  taxSummary.incomeByReceiptMethod.map(([method, data]) => (
                    <tr key={method}>
                      <td className="py-2.5 font-medium text-slate-900">
                        {RECEIPT_METHOD_LABELS[
                          method as keyof typeof RECEIPT_METHOD_LABELS
                        ] ?? method}
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs text-slate-500 tabular-nums">
                        {data.count}件
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatJPY(data.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Accounting Subjects Table / Mobile List */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              勘定科目別 経費集計表（家事按分反映）
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              家賃・光熱費・通信費などの按分率を自動計算し、確定申告にそのまま使える科目別合計を表示します
            </p>
          </div>
          <span className="font-mono text-sm font-bold text-teal-800 tabular-nums">
            経費算入合計: {formatJPY(taxSummary.totalDeductibleExpense)}
          </span>
        </div>

        {/* Mobile Stacked List */}
        <div className="mt-3 divide-y divide-slate-100 md:hidden">
          {taxSummary.expenseBySubject.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-400">
              {selectedYear}年の事業経費はまだ登録されていません
            </p>
          ) : (
            taxSummary.expenseBySubject.map(([subj, data]) => (
              <div key={subj} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{subj}</div>
                  <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                    {data.count}件 · 総支払額 {formatJPY(data.gross)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                    {formatJPY(data.deductible)}
                  </div>
                  <div className="text-[11px] text-slate-400">算入額</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2.5 font-medium">勘定科目</th>
                <th className="py-2.5 text-right font-medium">件数</th>
                <th className="py-2.5 text-right font-medium">総支払額</th>
                <th className="py-2.5 text-right font-medium">経費算入額（按分後）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {taxSummary.expenseBySubject.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-xs text-slate-400">
                    {selectedYear}年の事業経費はまだ登録されていません
                  </td>
                </tr>
              ) : (
                taxSummary.expenseBySubject.map(([subj, data]) => (
                  <tr key={subj}>
                    <td className="py-2.5 font-medium text-slate-900">{subj}</td>
                    <td className="py-2.5 text-right font-mono text-xs text-slate-500 tabular-nums">
                      {data.count}件
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs text-slate-500 tabular-nums">
                      {formatJPY(data.gross)}
                    </td>
                    <td className="py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatJPY(data.deductible)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detailed Ledger Lists for Tax Audit */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4">
            <h3 className="text-base font-semibold text-slate-900">
              事業・雑所得・ギフト収入明細
            </h3>
          </div>
          {taxSummary.giftAndMiscList.length === 0 ? (
            <p className="px-6 py-10 text-center text-xs text-slate-400">明細なし</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {taxSummary.giftAndMiscList.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => onEditTransaction(tx)}
                  className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70 sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-snug text-slate-900 break-words">
                      {tx.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                      <span className="tabular-nums">{formatFullDate(tx.date)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {INCOME_TAX_CATEGORY_LABELS[
                          tx.incomeTaxCategory ?? 'miscellaneous'
                        ] ?? '雑所得'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {RECEIPT_METHOD_LABELS[tx.receiptMethod ?? 'bank_transfer'] ??
                          '銀行振込'}
                      </span>
                      {tx.counterparty && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="break-words">{tx.counterparty}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-sm font-semibold text-emerald-700">
                        +{formatJPY(tx.amount)}
                      </div>
                      {(tx.withholdingTax ?? 0) > 0 && (
                        <div className="text-[11px] text-slate-500">
                          源泉 {formatJPY(tx.withholdingTax ?? 0)}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden="true" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4">
            <h3 className="text-base font-semibold text-slate-900">
              登録済み事業経費明細
            </h3>
          </div>
          {taxSummary.businessExpenseList.length === 0 ? (
            <p className="px-6 py-10 text-center text-xs text-slate-400">明細なし</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {taxSummary.businessExpenseList.slice(0, 12).map((tx) => {
                const deductible = getDeductibleBusinessAmount(tx);
                const ratio = tx.businessRatio ?? (tx.scope === 'business' ? 100 : 0);
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => onEditTransaction(tx)}
                    className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70 sm:px-6"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug text-slate-900 break-words">
                        {tx.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                        <span className="tabular-nums">{formatFullDate(tx.date)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {tx.type === 'transfer'
                            ? '支払手数料'
                            : tx.accountingSubject ?? '雑費'}
                        </span>
                        {tx.type === 'expense' && ratio < 100 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>按分 {ratio}%</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-sm font-semibold text-slate-900">
                          {formatJPY(deductible)}
                        </div>
                        {tx.type === 'expense' && deductible !== tx.amount && (
                          <div className="text-[11px] text-slate-400">
                            総額 {formatJPY(tx.amount)}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden="true" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
