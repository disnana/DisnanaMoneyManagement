import React, { useMemo, useState } from 'react';
import { Plus, Check, Trash2, X, CalendarCheck2, Target } from 'lucide-react';
import { Account, RecurringItem, SavingsGoal, Transaction } from '../types/finance';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryById } from '../data/categories';
import { formatFullDate, formatJPY, formatMonthLabel } from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';

interface PlanningViewProps {
  recurringItems: RecurringItem[];
  savingsGoals: SavingsGoal[];
  transactions: Transaction[];
  accounts: Account[];
  accountNameMap: Record<string, string>;
  selectedMonth: string;
  onAddRecurring: (item: Omit<RecurringItem, 'id'>) => void;
  onDeleteRecurring: (id: string) => void;
  onRecordRecurring: (item: RecurringItem, monthKey: string) => void;
  onAddGoal: (goal: Omit<SavingsGoal, 'id'>) => void;
  onContributeGoal: (id: string, delta: number) => void;
  onDeleteGoal: (id: string) => void;
}

export const PlanningView: React.FC<PlanningViewProps> = ({
  recurringItems,
  savingsGoals,
  transactions,
  accounts,
  accountNameMap,
  selectedMonth,
  onAddRecurring,
  onDeleteRecurring,
  onRecordRecurring,
  onAddGoal,
  onContributeGoal,
  onDeleteGoal,
}) => {
  const [recModalOpen, setRecModalOpen] = useState(false);
  const [recTitle, setRecTitle] = useState('');
  const [recType, setRecType] = useState<'expense' | 'income'>('expense');
  const [recAmount, setRecAmount] = useState('');
  const [recCategoryId, setRecCategoryId] = useState(EXPENSE_CATEGORIES[3].id);
  const [recAccountId, setRecAccountId] = useState(accounts[0]?.id ?? '');
  const [recDay, setRecDay] = useState('25');

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('0');
  const [goalDate, setGoalDate] = useState('');
  const [goalNote, setGoalNote] = useState('');

  const [customContribGoal, setCustomContribGoal] = useState<SavingsGoal | null>(null);
  const [contribAmount, setContribAmount] = useState('10000');

  const [deletingRec, setDeletingRec] = useState<RecurringItem | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<SavingsGoal | null>(null);

  const recordedRecurringIdsInMonth = useMemo(() => {
    const set = new Set<string>();
    for (const tx of transactions) {
      if (tx.date.slice(0, 7) === selectedMonth && tx.recurringId) {
        set.add(tx.recurringId);
      }
    }
    return set;
  }, [transactions, selectedMonth]);

  const recurringTotals = useMemo(() => {
    let fixedIncome = 0;
    let fixedExpense = 0;
    for (const item of recurringItems) {
      if (!item.isActive) continue;
      if (item.type === 'income') fixedIncome += item.amount;
      else fixedExpense += item.amount;
    }
    return { fixedIncome, fixedExpense, fixedNet: fixedIncome - fixedExpense };
  }, [recurringItems]);

  const handleSaveRecurring = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(recAmount);
    if (!recTitle.trim() || !Number.isFinite(amount) || amount <= 0) return;
    onAddRecurring({
      title: recTitle.trim(),
      type: recType,
      amount: Math.round(amount),
      categoryId: recCategoryId,
      accountId: recAccountId || accounts[0]?.id || '',
      dayOfMonth: Math.min(28, Math.max(1, Number(recDay) || 1)),
      isActive: true,
    });
    setRecModalOpen(false);
    setRecTitle('');
    setRecAmount('');
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const targetAmount = Number(goalTarget);
    const currentAmount = Number(goalCurrent) || 0;
    if (!goalTitle.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0) return;
    onAddGoal({
      title: goalTitle.trim(),
      targetAmount: Math.round(targetAmount),
      currentAmount: Math.max(0, Math.round(currentAmount)),
      targetDate: goalDate || undefined,
      note: goalNote.trim() || undefined,
    });
    setGoalModalOpen(false);
    setGoalTitle('');
    setGoalTarget('');
    setGoalCurrent('0');
    setGoalDate('');
    setGoalNote('');
  };

  const handleContribSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customContribGoal) return;
    const val = Number(contribAmount);
    if (!Number.isFinite(val) || val === 0) return;
    onContributeGoal(customContribGoal.id, Math.round(val));
    setCustomContribGoal(null);
  };

  return (
    <div className="space-y-10">
      {/* Section 1: Recurring Fixed Bills & Income */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              毎月の固定費・定期収入
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              家賃やサブスク、給与を登録しておくと、{formatMonthLabel(selectedMonth)}分をワンクリックで記帳できます
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setRecType('expense');
              setRecCategoryId(EXPENSE_CATEGORIES[3].id);
              setRecAccountId(accounts[0]?.id ?? '');
              setRecModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>定期項目を追加</span>
          </button>
        </div>

        {/* Recurring Monthly Balance Strip */}
        <div className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">毎月の定期収入</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
              +{formatJPY(recurringTotals.fixedIncome)}
            </div>
          </div>
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">毎月の固定費合計</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              -{formatJPY(recurringTotals.fixedExpense)}
            </div>
          </div>
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">基礎余剰資金（収入 − 固定費）</div>
            <div
              className={`mt-1 font-mono text-xl font-bold tabular-nums ${
                recurringTotals.fixedNet >= 0 ? 'text-teal-800' : 'text-red-600'
              }`}
            >
              {recurringTotals.fixedNet >= 0
                ? `+${formatJPY(recurringTotals.fixedNet)}`
                : formatJPY(recurringTotals.fixedNet)}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {recurringItems.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <CalendarCheck2 className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-600">定期取引はまだ登録されていません</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recurringItems.map((item) => {
                const cat = getCategoryById(item.categoryId);
                const accName = accountNameMap[item.accountId] ?? '口座';
                const isRecorded = recordedRecurringIdsInMonth.has(item.id);

                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {item.title}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-xs text-slate-500">
                          毎月 {item.dayOfMonth}日
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <span>{item.type === 'income' ? '収入' : '支出'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{cat.name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{accName}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span
                        className={`font-mono text-sm font-bold tabular-nums ${
                          item.type === 'income' ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                      >
                        {item.type === 'income'
                          ? `+${formatJPY(item.amount)}`
                          : `-${formatJPY(item.amount)}`}
                      </span>

                      {isRecorded ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
                          <Check className="h-3.5 w-3.5" />
                          <span>{formatMonthLabel(selectedMonth)} 記帳済</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onRecordRecurring(item, selectedMonth)}
                          className="rounded-lg border border-teal-700 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-800 transition-colors hover:bg-teal-100 whitespace-nowrap"
                        >
                          今月分を記帳
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeletingRec(item)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`${item.title}を削除`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Savings Goals */}
      <section className="space-y-4 border-t border-slate-200 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">貯蓄目標</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              ライフイベントや予備資金ごとの達成状況を管理できます
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGoalModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>目標を追加</span>
          </button>
        </div>

        {savingsGoals.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
            <Target className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-600">貯蓄目標はまだありません</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {savingsGoals.map((goal) => {
              const ratio =
                goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;
              const pct = Math.min(100, Math.round(ratio * 100));
              const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

              return (
                <article
                  key={goal.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{goal.title}</h3>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <span className="font-mono font-medium text-teal-800 tabular-nums">
                            {pct}% 達成
                          </span>
                          {goal.targetDate && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                期限 {formatFullDate(goal.targetDate)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setDeletingGoal(goal)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`${goal.title}を削除`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {goal.note && (
                      <p className="mt-2.5 text-xs text-slate-500">{goal.note}</p>
                    )}

                    <div className="mt-4">
                      <div className="flex items-baseline justify-between text-xs font-mono tabular-nums">
                        <span className="text-base font-bold text-slate-900">
                          {formatJPY(goal.currentAmount)}
                        </span>
                        <span className="text-slate-500">
                          目標 {formatJPY(goal.targetAmount)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${
                            pct >= 100 ? 'bg-emerald-600' : 'bg-teal-700'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1.5 text-right font-mono text-xs text-slate-500 tabular-nums">
                        {remaining === 0 ? '目標達成済み' : `あと ${formatJPY(remaining)}`}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => onContributeGoal(goal.id, 10000)}
                      className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 tabular-nums whitespace-nowrap"
                    >
                      +¥10,000 積立
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomContribGoal(goal);
                        setContribAmount('20000');
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
                    >
                      金額指定
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Add Recurring Modal */}
      {recModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">定期取引を追加</h3>
              <button
                type="button"
                onClick={() => setRecModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveRecurring} className="space-y-4 p-6">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setRecType('expense');
                    setRecCategoryId(EXPENSE_CATEGORIES[0].id);
                  }}
                  className={`rounded-md py-1.5 text-xs font-semibold ${
                    recType === 'expense' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  固定支出
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecType('income');
                    setRecCategoryId(INCOME_CATEGORIES[0].id);
                  }}
                  className={`rounded-md py-1.5 text-xs font-semibold ${
                    recType === 'income' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  定期収入
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">名称</label>
                <input
                  type="text"
                  required
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  placeholder="例: 家賃、ジム会費、月次給与"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600">金額 (円)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={recAmount}
                    onChange={(e) => setRecAmount(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm font-semibold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">毎月の日付 (1〜28)</label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    required
                    value={recDay}
                    onChange={(e) => setRecDay(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600">カテゴリ</label>
                  <select
                    value={recCategoryId}
                    onChange={(e) => setRecCategoryId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {(recType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">口座</label>
                  <select
                    value={recAccountId}
                    onChange={(e) => setRecAccountId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setRecModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  追加する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Goal Modal */}
      {goalModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">貯蓄目標を追加</h3>
              <button
                type="button"
                onClick={() => setGoalModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveGoal} className="space-y-4 p-6">
              <div>
                <label className="block text-xs font-medium text-slate-600">目標タイトル</label>
                <input
                  type="text"
                  required
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="例: 引っ越し資金、海外旅行"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600">目標金額 (円)</label>
                  <input
                    type="number"
                    min="1000"
                    required
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm font-semibold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">現在の積立額 (円)</label>
                  <input
                    type="number"
                    min="0"
                    value={goalCurrent}
                    onChange={(e) => setGoalCurrent(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">目標期日（任意）</label>
                <input
                  type="date"
                  value={goalDate}
                  onChange={(e) => setGoalDate(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">メモ（任意）</label>
                <input
                  type="text"
                  value={goalNote}
                  onChange={(e) => setGoalNote(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setGoalModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  追加する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Contribution Modal */}
      {customContribGoal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                積立額を更新: {customContribGoal.title}
              </h3>
              <button
                type="button"
                onClick={() => setCustomContribGoal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleContribSubmit} className="space-y-4 p-6">
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  増減額 (円) — 引き出す場合はマイナスを入力
                </label>
                <input
                  type="number"
                  required
                  value={contribAmount}
                  onChange={(e) => setContribAmount(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg font-semibold tabular-nums"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setCustomContribGoal(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  更新する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deletingRec)}
        title="定期項目を削除しますか？"
        description={
          deletingRec ? `「${deletingRec.title}」を定期リストから削除します。` : ''
        }
        confirmLabel="削除する"
        danger={true}
        onConfirm={() => {
          if (deletingRec) {
            onDeleteRecurring(deletingRec.id);
            setDeletingRec(null);
          }
        }}
        onCancel={() => setDeletingRec(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingGoal)}
        title="貯蓄目標を削除しますか？"
        description={
          deletingGoal ? `「${deletingGoal.title}」を削除します。` : ''
        }
        confirmLabel="削除する"
        danger={true}
        onConfirm={() => {
          if (deletingGoal) {
            onDeleteGoal(deletingGoal.id);
            setDeletingGoal(null);
          }
        }}
        onCancel={() => setDeletingGoal(null)}
      />
    </div>
  );
};
