import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X } from 'lucide-react';
import { Budget, Transaction } from '../types/finance';
import { EXPENSE_CATEGORIES, getCategoryById } from '../data/categories';
import { formatJPY, formatMonthLabel, shiftMonth } from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';

interface BudgetsViewProps {
  budgets: Budget[];
  transactions: Transaction[];
  selectedMonth: string;
  onChangeMonth: (monthKey: string) => void;
  onUpsertBudget: (budget: Budget) => void;
  onRemoveBudget: (categoryId: string) => void;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({
  budgets,
  transactions,
  selectedMonth,
  onChangeMonth,
  onUpsertBudget,
  onRemoveBudget,
}) => {
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formCategoryId, setFormCategoryId] = useState(EXPENSE_CATEGORIES[0].id);
  const [formLimit, setFormLimit] = useState('');
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.type === 'expense' && tx.date.slice(0, 7) === selectedMonth) {
        map[tx.categoryId] = (map[tx.categoryId] ?? 0) + tx.amount;
      }
    }
    return map;
  }, [transactions, selectedMonth]);

  const totals = useMemo(() => {
    let totalBudget = 0;
    let totalBudgetedSpent = 0;
    for (const b of budgets) {
      totalBudget += b.monthlyLimit;
      totalBudgetedSpent += spentByCategory[b.categoryId] ?? 0;
    }
    const allMonthExpense = Object.values(spentByCategory).reduce((s, v) => s + v, 0);
    return {
      totalBudget,
      totalBudgetedSpent,
      allMonthExpense,
      remaining: totalBudget - totalBudgetedSpent,
      ratio: totalBudget > 0 ? totalBudgetedSpent / totalBudget : 0,
    };
  }, [budgets, spentByCategory]);

  // Days remaining in selected month for safe daily pace
  const remainingDays = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (selectedMonth === currentKey) {
      return Math.max(1, totalDays - now.getDate() + 1);
    }
    return totalDays;
  }, [selectedMonth]);

  const unbudgetedCategories = useMemo(() => {
    const set = new Set(budgets.map((b) => b.categoryId));
    return EXPENSE_CATEGORIES.filter((c) => !set.has(c.id));
  }, [budgets]);

  const openAddModal = () => {
    setEditingCategory(null);
    setFormCategoryId(unbudgetedCategories[0]?.id ?? EXPENSE_CATEGORIES[0].id);
    setFormLimit('30000');
    setModalOpen(true);
  };

  const openEditModal = (budget: Budget) => {
    setEditingCategory(budget.categoryId);
    setFormCategoryId(budget.categoryId);
    setFormLimit(String(budget.monthlyLimit));
    setModalOpen(true);
  };

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(formLimit);
    if (!Number.isFinite(val) || val <= 0) return;
    onUpsertBudget({
      categoryId: formCategoryId,
      monthlyLimit: Math.round(val),
    });
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">カテゴリ別予算管理</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            カテゴリごとに月間の上限額を設定し、使いすぎを事前に防ぎます
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => onChangeMonth(shiftMonth(selectedMonth, -1))}
              className="rounded-l-lg p-2 text-slate-600 hover:bg-slate-50"
              aria-label="前の月"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[104px] px-3 text-center font-mono text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">
              {formatMonthLabel(selectedMonth)}
            </span>
            <button
              type="button"
              onClick={() => onChangeMonth(shiftMonth(selectedMonth, 1))}
              className="rounded-r-lg p-2 text-slate-600 hover:bg-slate-50"
              aria-label="次の月"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>予算を追加</span>
          </button>
        </div>
      </div>

      {/* Overall Summary Strip */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-slate-500">月間設定予算合計</div>
            <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {formatJPY(totals.totalBudget)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">予算対象カテゴリの支出</div>
            <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {formatJPY(totals.totalBudgetedSpent)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">残り予算（1日あたり目安）</div>
            <div
              className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                totals.remaining >= 0 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {totals.remaining >= 0
                ? formatJPY(totals.remaining)
                : `-${formatJPY(Math.abs(totals.remaining))}`}
            </div>
            {totals.remaining > 0 && (
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                残り{remainingDays}日 · 1日あたり{' '}
                {formatJPY(Math.floor(totals.remaining / remainingDays))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>全体の消化率</span>
            <span className="font-mono font-semibold tabular-nums">
              {Math.round(totals.ratio * 100)}%
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${
                totals.ratio > 1
                  ? 'bg-red-600'
                  : totals.ratio >= 0.85
                  ? 'bg-amber-500'
                  : 'bg-teal-700'
              }`}
              style={{ width: `${Math.min(100, Math.round(totals.ratio * 100))}%` }}
            />
          </div>
        </div>
      </section>

      {/* Category Budgets Grid */}
      {budgets.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-700">予算がまだ設定されていません</p>
          <p className="mt-1 text-xs text-slate-500">
            食費や日用品など、管理したいカテゴリの月間上限を設定しましょう。
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>最初の予算を設定</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {budgets.map((budget) => {
            const cat = getCategoryById(budget.categoryId);
            const spent = spentByCategory[budget.categoryId] ?? 0;
            const remaining = budget.monthlyLimit - spent;
            const ratio = budget.monthlyLimit > 0 ? spent / budget.monthlyLimit : 0;
            const pct = Math.round(ratio * 100);

            const statusText =
              ratio > 1 ? '予算超過' : ratio >= 0.8 ? '残りわずか' : '予算内';
            const statusClass =
              ratio > 1
                ? 'text-red-600'
                : ratio >= 0.8
                ? 'text-amber-700'
                : 'text-emerald-700';
            const barClass =
              ratio > 1
                ? 'bg-red-600'
                : ratio >= 0.8
                ? 'bg-amber-500'
                : 'bg-teal-700';

            return (
              <article
                key={budget.categoryId}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{cat.name}</h3>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                        <span className={`font-medium ${statusClass}`}>{statusText}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-mono text-slate-500 tabular-nums">{pct}% 使用</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(budget)}
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`${cat.name}の予算を編集`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCategoryId(budget.categoryId)}
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label={`${cat.name}の予算を削除`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${barClass}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-3 text-xs">
                  <span className="font-mono text-slate-600 tabular-nums">
                    {formatJPY(spent)} / {formatJPY(budget.monthlyLimit)}
                  </span>
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      remaining >= 0 ? 'text-slate-700' : 'text-red-600'
                    }`}
                  >
                    {remaining >= 0
                      ? `残り ${formatJPY(remaining)}`
                      : `${formatJPY(Math.abs(remaining))} 超過`}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Add / Edit Budget Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingCategory ? '予算額を変更' : 'カテゴリ予算を設定'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveBudget} className="space-y-4 p-6">
              <div>
                <label htmlFor="budget-category" className="block text-xs font-medium text-slate-600">
                  カテゴリ
                </label>
                <select
                  id="budget-category"
                  value={formCategoryId}
                  disabled={Boolean(editingCategory)}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="budget-limit" className="block text-xs font-medium text-slate-600">
                  月間予算額 (円)
                </label>
                <input
                  id="budget-limit"
                  type="number"
                  min="100"
                  step="100"
                  required
                  value={formLimit}
                  onChange={(e) => setFormLimit(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-lg font-semibold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deletingCategoryId)}
        title="予算設定を削除しますか？"
        description={
          deletingCategoryId
            ? `「${getCategoryById(deletingCategoryId).name}」の月間予算設定を削除します。取引データ自体は削除されません。`
            : ''
        }
        confirmLabel="削除する"
        danger={true}
        onConfirm={() => {
          if (deletingCategoryId) {
            onRemoveBudget(deletingCategoryId);
            setDeletingCategoryId(null);
          }
        }}
        onCancel={() => setDeletingCategoryId(null)}
      />
    </div>
  );
};
