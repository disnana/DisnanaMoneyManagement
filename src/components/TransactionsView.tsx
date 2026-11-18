import React, { useMemo, useState } from 'react';
import {
  Search,
  Download,
  Pencil,
  Trash2,
  ArrowUpDown,
  Plus,
  RotateCcw,
  ChevronRight,
} from 'lucide-react';
import { Account, Transaction, TransactionScope, TransactionType } from '../types/finance';
import {
  ALL_CATEGORIES,
  INCOME_TAX_CATEGORY_LABELS,
  RECEIPT_METHOD_LABELS,
  getCategoryById,
} from '../data/categories';
import {
  exportTransactionsToCSV,
  formatForeignCurrency,
  formatFullDate,
  formatJPY,
  formatSignedJPY,
  getEffectiveOutflow,
  getTransferTotalFees,
} from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';
import { MonthSwitcherBar } from './MonthSwitcherBar';

interface TransactionsViewProps {
  transactions: Transaction[];
  accounts: Account[];
  accountNameMap: Record<string, string>;
  selectedMonth: string;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onDeleteSettlementGroup?: (groupId: string) => void;
  onOpenAddTransaction: () => void;
}

function buildDetailParts(tx: Transaction): string[] {
  const detailParts: string[] = [];
  if (tx.counterparty) detailParts.push(tx.counterparty);
  if (tx.foreignCurrency && tx.foreignGrossAmount !== undefined) {
    const fxText = formatForeignCurrency(tx.foreignGrossAmount, tx.foreignCurrency);
    detailParts.push(tx.fxRate ? `${fxText} @ ¥${tx.fxRate}` : fxText);
  }
  if (tx.netJpyAmount !== undefined && tx.type === 'income') {
    detailParts.push(`銀行純入金 ${formatJPY(tx.netJpyAmount)}`);
  }
  if (tx.type === 'income') {
    if (tx.receiptMethod) {
      detailParts.push(RECEIPT_METHOD_LABELS[tx.receiptMethod]);
    }
    if (tx.incomeTaxCategory) {
      detailParts.push(INCOME_TAX_CATEGORY_LABELS[tx.incomeTaxCategory]);
    }
  }
  if (tx.type === 'expense' && tx.scope === 'business') {
    detailParts.push(tx.accountingSubject ?? '経費');
    if ((tx.businessRatio ?? 100) < 100) {
      detailParts.push(`按分${tx.businessRatio}%`);
    }
  }
  if (tx.type === 'transfer' && tx.isPrepayment) {
    detailParts.push('先払い・繰上返済');
  }
  if (tx.memo) detailParts.push(tx.memo);
  return detailParts;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  accounts,
  accountNameMap,
  selectedMonth,
  onEditTransaction,
  onDeleteTransaction,
  onDeleteSettlementGroup,
  onOpenAddTransaction,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | TransactionScope>('all');
  const [monthFilter, setMonthFilter] = useState<string>(selectedMonth);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<
    'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
  >('date_desc');
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions
      .filter((tx) => {
        if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
        if (scopeFilter !== 'all' && (tx.scope ?? 'personal') !== scopeFilter) {
          return false;
        }
        if (monthFilter !== 'all' && tx.date.slice(0, 7) !== monthFilter) return false;
        if (categoryFilter !== 'all' && tx.categoryId !== categoryFilter) return false;
        if (
          accountFilter !== 'all' &&
          tx.accountId !== accountFilter &&
          tx.toAccountId !== accountFilter
        ) {
          return false;
        }
        if (q) {
          const catName = getCategoryById(tx.categoryId).name.toLowerCase();
          const accName = (accountNameMap[tx.accountId] ?? '').toLowerCase();
          const hit =
            tx.title.toLowerCase().includes(q) ||
            (tx.memo ?? '').toLowerCase().includes(q) ||
            (tx.counterparty ?? '').toLowerCase().includes(q) ||
            (tx.accountingSubject ?? '').toLowerCase().includes(q) ||
            catName.includes(q) ||
            accName.includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date_desc') return b.date.localeCompare(a.date);
        if (sortBy === 'date_asc') return a.date.localeCompare(b.date);
        if (sortBy === 'amount_desc') return b.amount - a.amount;
        return a.amount - b.amount;
      });
  }, [
    transactions,
    typeFilter,
    scopeFilter,
    monthFilter,
    categoryFilter,
    accountFilter,
    searchQuery,
    sortBy,
    accountNameMap,
  ]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filtered) {
      if (tx.type === 'income') income += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount;
      else if (tx.type === 'transfer') {
        expense += getTransferTotalFees(tx);
      }
    }
    return { income, expense, net: income - expense };
  }, [filtered]);

  const hasActiveFilters = Boolean(
    searchQuery ||
      typeFilter !== 'all' ||
      scopeFilter !== 'all' ||
      monthFilter !== selectedMonth ||
      categoryFilter !== 'all' ||
      accountFilter !== 'all'
  );

  const toggleDateSort = () => {
    setSortBy((prev) => (prev === 'date_desc' ? 'date_asc' : 'date_desc'));
  };

  const toggleAmountSort = () => {
    setSortBy((prev) => (prev === 'amount_desc' ? 'amount_asc' : 'amount_desc'));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            取引履歴台帳
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
            個人・事業、ポイント充当、振替手数料、受取形態（ギフト券等）を含めて検索・管理できます
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            exportTransactionsToCSV(
              filtered,
              accountNameMap,
              `dmm-${monthFilter === 'all' ? 'all' : monthFilter}.csv`
            )
          }
          disabled={filtered.length === 0}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto whitespace-nowrap"
        >
          <Download className="h-4 w-4" />
          <span>表示中をCSV出力</span>
        </button>
      </div>

      {/* Filter Bar */}
      <section className="space-y-3.5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="grid grid-cols-4 rounded-xl bg-slate-100 p-1 sm:inline-flex">
              {(
                [
                  { id: 'all', label: 'すべて' },
                  { id: 'expense', label: '支出' },
                  { id: 'income', label: '収入' },
                  { id: 'transfer', label: '振替' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTypeFilter(tab.id)}
                  className={`min-h-[40px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                    typeFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1 sm:inline-flex">
              {(
                [
                  { id: 'all', label: '個人・事業' },
                  { id: 'personal', label: '個人' },
                  { id: 'business', label: '事業・経費' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScopeFilter(tab.id)}
                  className={`min-h-[40px] rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    scopeFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="項目名・取引先・勘定科目・メモで検索"
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-3.5 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
            <MonthSwitcherBar
              selectedMonth={monthFilter}
              onChangeMonth={setMonthFilter}
              allowAll={true}
              className="w-full lg:w-auto"
            />

            <select
              aria-label="カテゴリで絞り込む"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:border-teal-600 focus:outline-none lg:w-auto"
            >
              <option value="all">すべてのカテゴリ</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              aria-label="口座で絞り込む"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:border-teal-600 focus:outline-none lg:w-auto"
            >
              <option value="all">すべての口座</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('all');
                  setScopeFilter('all');
                  setMonthFilter(selectedMonth);
                  setCategoryFilter('all');
                  setAccountFilter('all');
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-teal-700 transition-all hover:bg-slate-100 active:scale-[0.98] whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>条件をリセット</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 tabular-nums lg:ml-auto">
            <span>該当 {filtered.length}件</span>
            <span aria-hidden="true">·</span>
            <span>
              収入{' '}
              <strong className="font-mono text-emerald-700">
                {formatJPY(summary.income)}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              支出{' '}
              <strong className="font-mono text-slate-900">
                {formatJPY(summary.expense)}
              </strong>
            </span>
          </div>
        </div>
      </section>

      {/* Ledger Table / Mobile Cards */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-700">
              条件に一致する取引が見つかりませんでした
            </p>
            <p className="mt-1 text-xs text-slate-500">
              絞り込み条件を変更するか、新しい収支を記録してください。
            </p>
            <button
              type="button"
              onClick={onOpenAddTransaction}
              className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-700 px-5 text-xs font-semibold text-white transition-all hover:bg-teal-800 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              <span>収支を記録する</span>
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Card List (tappable rows + >=44px action buttons) */}
            <div className="divide-y divide-slate-100 md:hidden">
              {filtered.map((tx) => {
                const cat = getCategoryById(tx.categoryId);
                const accName = accountNameMap[tx.accountId] ?? '不明な口座';
                const toAccName = tx.toAccountId
                  ? accountNameMap[tx.toAccountId] ?? '不明な口座'
                  : '';

                const detailParts = buildDetailParts(tx);
                const totalTransferFees = getTransferTotalFees(tx);

                return (
                  <div key={tx.id} className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => onEditTransaction(tx)}
                      className="flex w-full items-start justify-between gap-3 rounded-lg text-left transition-colors active:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold leading-snug text-slate-900 break-words">
                          {tx.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                          <span className="font-mono tabular-nums">
                            {formatFullDate(tx.date)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{cat.name}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {tx.type === 'transfer' ? `${accName} → ${toAccName}` : accName}
                          </span>
                          {tx.scope === 'business' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-teal-800">事業</span>
                            </>
                          )}
                        </div>
                        {detailParts.length > 0 && (
                          <p className="mt-1 text-xs leading-relaxed text-slate-500 break-words">
                            {detailParts.join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <div className="text-right font-mono tabular-nums">
                          <div
                            className={`text-sm font-semibold ${
                              tx.type === 'income'
                                ? 'text-emerald-700'
                                : tx.type === 'expense'
                                ? 'text-slate-900'
                                : 'text-slate-500'
                            }`}
                          >
                            {formatSignedJPY(tx.amount, tx.type)}
                          </div>
                          {tx.type === 'income' &&
                            tx.netJpyAmount !== undefined &&
                            tx.netJpyAmount !== tx.amount && (
                              <div className="text-[11px] text-teal-700">
                                純入金 {formatJPY(tx.netJpyAmount)}
                              </div>
                            )}
                          {totalTransferFees > 0 && (
                            <div className="text-[11px] text-slate-500">
                              手数料 {formatJPY(totalTransferFees)}
                            </div>
                          )}
                          {tx.type === 'expense' && (tx.pointUsed ?? 0) > 0 && (
                            <div className="text-[11px] text-teal-700">
                              P充当 {formatJPY(tx.pointUsed ?? 0)}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden="true" />
                      </div>
                    </button>

                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onEditTransaction(tx)}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>編集</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingTx(tx)}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-red-600 transition-all hover:bg-red-50 active:scale-[0.98]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>削除</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500">
                    <th className="py-2.5 pl-6 pr-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={toggleDateSort}
                        className="inline-flex min-h-[40px] items-center gap-1 font-medium hover:text-slate-900"
                      >
                        <span>日付</span>
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </th>
                    <th className="px-3 py-3">項目・税務/取引詳細</th>
                    <th className="px-3 py-3 whitespace-nowrap">カテゴリ / 区分</th>
                    <th className="px-3 py-3 whitespace-nowrap">口座</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={toggleAmountSort}
                        className="inline-flex min-h-[40px] items-center justify-end gap-1 font-medium hover:text-slate-900"
                      >
                        <span>金額</span>
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </th>
                    <th className="py-3 pl-3 pr-6 text-right whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((tx) => {
                    const cat = getCategoryById(tx.categoryId);
                    const accName = accountNameMap[tx.accountId] ?? '不明な口座';
                    const toAccName = tx.toAccountId
                      ? accountNameMap[tx.toAccountId] ?? '不明な口座'
                      : '';

                    const detailParts = buildDetailParts(tx);
                    const totalTransferFees = getTransferTotalFees(tx);

                    return (
                      <tr
                        key={tx.id}
                        className="group align-top transition-colors hover:bg-slate-50/80"
                      >
                        <td className="py-3.5 pl-6 pr-3 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {formatFullDate(tx.date)}
                        </td>
                        <td className="min-w-[200px] px-3 py-3.5">
                          <div className="font-medium leading-snug text-slate-900 break-words">
                            {tx.title}
                          </div>
                          {detailParts.length > 0 && (
                            <div className="mt-0.5 text-xs leading-relaxed text-slate-500 break-words">
                              {detailParts.join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-xs text-slate-700">
                          <div className="leading-snug">{cat.name}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {tx.scope === 'business' ? '事業・経費' : '個人'}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-xs leading-snug text-slate-600 break-words">
                          {tx.type === 'transfer' ? `${accName} → ${toAccName}` : accName}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                          <div
                            className={`text-sm font-semibold ${
                              tx.type === 'income'
                                ? 'text-emerald-700'
                                : tx.type === 'expense'
                                ? 'text-slate-900'
                                : 'text-slate-500'
                            }`}
                          >
                            {formatSignedJPY(tx.amount, tx.type)}
                          </div>
                          {tx.type === 'income' &&
                            tx.netJpyAmount !== undefined &&
                            tx.netJpyAmount !== tx.amount && (
                              <div className="text-[11px] text-teal-700">
                                銀行純入金 {formatJPY(tx.netJpyAmount)}
                              </div>
                            )}
                          {totalTransferFees > 0 && (
                            <div className="text-[11px] text-slate-500">
                              手数料 {formatJPY(totalTransferFees)}
                            </div>
                          )}
                          {tx.type === 'expense' && (tx.pointUsed ?? 0) > 0 && (
                            <div className="text-[11px] text-teal-700">
                              P充当 {formatJPY(tx.pointUsed ?? 0)} · 実請求{' '}
                              {formatJPY(getEffectiveOutflow(tx))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pl-3 pr-6 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditTransaction(tx)}
                              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                              aria-label={`${tx.title}を編集`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingTx(tx)}
                              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              aria-label={`${tx.title}を削除`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deletingTx)}
        title="この取引を削除しますか？"
        description={
          deletingTx
            ? deletingTx.settlementGroupId
              ? `「${deletingTx.title}」（${formatJPY(
                  deletingTx.amount
                )} / ${formatFullDate(
                  deletingTx.date
                )}）を削除します。この取引は外貨・Stripe一括入金の連動レコードです。`
              : `「${deletingTx.title}」（${formatJPY(
                  deletingTx.amount
                )} / ${formatFullDate(
                  deletingTx.date
                )}）を削除します。口座残高も自動で再計算されます。`
            : ''
        }
        confirmLabel={deletingTx?.settlementGroupId ? 'この1件のみ削除' : '削除する'}
        secondaryLabel={
          deletingTx?.settlementGroupId && onDeleteSettlementGroup
            ? '連動セットごと削除'
            : undefined
        }
        onSecondaryConfirm={
          deletingTx?.settlementGroupId && onDeleteSettlementGroup
            ? () => {
                onDeleteSettlementGroup(deletingTx.settlementGroupId!);
                setDeletingTx(null);
              }
            : undefined
        }
        danger={true}
        onConfirm={() => {
          if (deletingTx) {
            onDeleteTransaction(deletingTx.id);
            setDeletingTx(null);
          }
        }}
        onCancel={() => setDeletingTx(null)}
      />
    </div>
  );
};

