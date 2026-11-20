import React, { useMemo, useState } from 'react';
import { Plus, Check, Trash2, CalendarCheck2, Target } from 'lucide-react';
import { Account, RecurringItem, SavingsGoal, Transaction } from '../types/finance';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryById } from '../data/categories';
import { formatFullDate, formatJPY, formatMonthLabel } from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';
import { usePendingSave } from '../hooks/usePendingSave';
import { ResponsiveSheet } from './ResponsiveSheet';
import { MonthSwitcherBar } from './MonthSwitcherBar';

interface PlanningViewProps {
  recurringItems: RecurringItem[];
  savingsGoals: SavingsGoal[];
  transactions: Transaction[];
  accounts: Account[];
  accountNameMap: Record<string, string>;
  selectedMonth: string;
  onChangeMonth: (monthKey: string) => void;
  onAddRecurring: (item: Omit<RecurringItem, 'id'>) => Promise<boolean>;
  onDeleteRecurring: (id: string) => Promise<boolean>;
  onRecordRecurring: (item: RecurringItem, monthKey: string) => Promise<boolean>;
  onAddGoal: (goal: Omit<SavingsGoal, 'id'>) => Promise<boolean>;
  onContributeGoal: (id: string, delta: number) => Promise<boolean>;
  onDeleteGoal: (id: string) => Promise<boolean>;
}

export const PlanningView: React.FC<PlanningViewProps> = ({
  recurringItems,
  savingsGoals,
  transactions,
  accounts,
  accountNameMap,
  selectedMonth,
  onChangeMonth,
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

  const recurringForm = usePendingSave(recModalOpen);
  const goalForm = usePendingSave(goalModalOpen);
  const contributionForm = usePendingSave(customContribGoal);
  const quickSave = usePendingSave(selectedMonth);

  const handleSaveRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(recAmount);
    if (!recTitle.trim() || !Number.isFinite(amount) || amount <= 0) return;
    const saved = await recurringForm.submit(() => onAddRecurring({
      title: recTitle.trim(),
      type: recType,
      amount: Math.round(amount),
      categoryId: recCategoryId,
      accountId: recAccountId || accounts[0]?.id || '',
      dayOfMonth: Math.min(28, Math.max(1, Number(recDay) || 1)),
      isActive: true,
    }));
    if (!saved) return;
    setRecModalOpen(false);
    setRecTitle('');
    setRecAmount('');
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetAmount = Number(goalTarget);
    const currentAmount = Number(goalCurrent) || 0;
    if (!goalTitle.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0) return;
    const saved = await goalForm.submit(() => onAddGoal({
      title: goalTitle.trim(),
      targetAmount: Math.round(targetAmount),
      currentAmount: Math.max(0, Math.round(currentAmount)),
      targetDate: goalDate || undefined,
      note: goalNote.trim() || undefined,
    }));
    if (!saved) return;
    setGoalModalOpen(false);
    setGoalTitle('');
    setGoalTarget('');
    setGoalCurrent('0');
    setGoalDate('');
    setGoalNote('');
  };

  const handleContribSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customContribGoal) return;
    const val = Number(contribAmount);
    if (!Number.isFinite(val) || val === 0) return;
    if (await contributionForm.submit(() => onContributeGoal(customContribGoal.id, Math.round(val)))) setCustomContribGoal(null);
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
            <p className="mt-0.5 hidden text-sm text-slate-500 lg:block">
              家賃やサブスク、給与を登録しておくと、{formatMonthLabel(selectedMonth)}分をワンクリックで記帳できます
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-2.5 sm:w-auto sm:justify-end">
            <MonthSwitcherBar
              selectedMonth={selectedMonth}
              onChangeMonth={onChangeMonth}
            />
            <button
              type="button"
              onClick={() => {
                setRecType('expense');
                setRecCategoryId(EXPENSE_CATEGORIES[3].id);
                setRecAccountId(accounts[0]?.id ?? '');
                setRecModalOpen(true);
              }}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white transition-all hover:bg-teal-800 active:scale-[0.98] whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>定期項目を追加</span>
            </button>
          </div>
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
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-slate-900 break-words">
                          {item.title}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-xs text-slate-500">
                          毎月 {item.dayOfMonth}日
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                        <span>{item.type === 'income' ? '収入' : '支出'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{cat.name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{accName}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
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
                        <span className="inline-flex min-h-[44px] items-center gap-1.5 px-2 text-xs font-medium text-emerald-700 whitespace-nowrap">
                          <Check className="h-4 w-4" />
                          <span>{formatMonthLabel(selectedMonth)} 記帳済</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void quickSave.submit(() => onRecordRecurring(item, selectedMonth))}
                          disabled={quickSave.pending}
                          className="min-h-[44px] rounded-xl border border-teal-700 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 transition-all hover:bg-teal-100 active:scale-[0.98] whitespace-nowrap"
                        >
                          今月分を記帳
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeletingRec(item)}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 active:scale-95"
                        aria-label={`${item.title}を削除`}
                      >
                        <Trash2 className="h-4 w-4" />
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
            <p className="mt-0.5 hidden text-sm text-slate-500 lg:block">
              ライフイベントや予備資金ごとの達成状況を管理できます
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGoalModalOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition-all hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
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
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 active:scale-95"
                        aria-label={`${goal.title}を削除`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {goal.note && (
                      <p className="mt-2.5 text-xs text-slate-500">{goal.note}</p>
                    )}

                    <div className="mt-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-mono tabular-nums">
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

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => void quickSave.submit(() => onContributeGoal(goal.id, 10000))}
                      disabled={quickSave.pending}
                      className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-semibold text-slate-800 transition-all hover:bg-slate-100 active:scale-[0.98] tabular-nums whitespace-nowrap"
                    >
                      +¥10,000 積立
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomContribGoal(goal);
                        setContribAmount('20000');
                      }}
                      className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
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
      <ResponsiveSheet
        open={recModalOpen}
        onClose={() => setRecModalOpen(false)}
        title="定期取引を追加"
        titleId="rec-modal-title"
        maxWidthClass="sm:max-w-md"
        footer={
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={() => setRecModalOpen(false)}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
            >
              キャンセル
            </button>
            <button
              type="submit"
              form="rec-modal-form"
              disabled={recurringForm.pending}
              className="min-h-[44px] rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 active:scale-[0.98]"
            >
              追加する
            </button>
          </div>
        }
      >
        <form inert={recurringForm.pending} aria-busy={recurringForm.pending} id="rec-modal-form" onSubmit={handleSaveRecurring} className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setRecType('expense');
                setRecCategoryId(EXPENSE_CATEGORIES[0].id);
              }}
              className={`min-h-[42px] rounded-lg py-2 text-xs font-semibold ${
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
              className={`min-h-[42px] rounded-lg py-2 text-xs font-semibold ${
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
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600">金額 (円)</label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                required
                value={recAmount}
                onChange={(e) => setRecAmount(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm font-semibold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">毎月の日付 (1〜28)</label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="28"
                required
                value={recDay}
                onChange={(e) => setRecDay(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600">カテゴリ</label>
              <select
                value={recCategoryId}
                onChange={(e) => setRecCategoryId(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
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
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </ResponsiveSheet>

      {/* Add Goal Modal */}
      <ResponsiveSheet
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title="貯蓄目標を追加"
        titleId="goal-modal-title"
        maxWidthClass="sm:max-w-md"
        footer={
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={() => setGoalModalOpen(false)}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
            >
              キャンセル
            </button>
            <button
              type="submit"
              form="goal-modal-form"
              disabled={goalForm.pending}
              className="min-h-[44px] rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 active:scale-[0.98]"
            >
              追加する
            </button>
          </div>
        }
      >
        <form inert={goalForm.pending} aria-busy={goalForm.pending} id="goal-modal-form" onSubmit={handleSaveGoal} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600">目標タイトル</label>
            <input
              type="text"
              required
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder="例: 引っ越し資金、海外旅行"
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600">目標金額 (円)</label>
              <input
                type="number"
                inputMode="numeric"
                min="1000"
                required
                value={goalTarget}
                onChange={(e) => setGoalTarget(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm font-semibold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">現在の積立額 (円)</label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={goalCurrent}
                onChange={(e) => setGoalCurrent(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">目標期日（任意）</label>
            <input
              type="date"
              value={goalDate}
              onChange={(e) => setGoalDate(e.target.value)}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">メモ（任意）</label>
            <input
              type="text"
              value={goalNote}
              onChange={(e) => setGoalNote(e.target.value)}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </form>
      </ResponsiveSheet>

      {/* Custom Contribution Modal */}
      <ResponsiveSheet
        open={Boolean(customContribGoal)}
        onClose={() => setCustomContribGoal(null)}
        title={customContribGoal ? `積立額を更新: ${customContribGoal.title}` : '積立額を更新'}
        titleId="contrib-modal-title"
        maxWidthClass="sm:max-w-sm"
        footer={
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={() => setCustomContribGoal(null)}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
            >
              キャンセル
            </button>
            <button
              type="submit"
              form="contrib-modal-form"
              disabled={contributionForm.pending}
              className="min-h-[44px] rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 active:scale-[0.98]"
            >
              更新する
            </button>
          </div>
        }
      >
        <form inert={contributionForm.pending} aria-busy={contributionForm.pending} id="contrib-modal-form" onSubmit={handleContribSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600">
              増減額 (円) — 引き出す場合はマイナスを入力
            </label>
            <input
              type="number"
              inputMode="numeric"
              required
              value={contribAmount}
              onChange={(e) => setContribAmount(e.target.value)}
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-lg font-semibold tabular-nums"
            />
          </div>
        </form>
      </ResponsiveSheet>

      <ConfirmDialog
        open={Boolean(deletingRec)}
        title="定期項目を削除しますか？"
        description={
          deletingRec ? `「${deletingRec.title}」を定期リストから削除します。` : ''
        }
        confirmLabel="削除する"
        danger={true}
        onConfirm={() => onDeleteRecurring(deletingRec!.id)}
        onClose={() => setDeletingRec(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingGoal)}
        title="貯蓄目標を削除しますか？"
        description={
          deletingGoal ? `「${deletingGoal.title}」を削除します。` : ''
        }
        confirmLabel="削除する"
        danger={true}
        onConfirm={() => onDeleteGoal(deletingGoal!.id)}
        onClose={() => setDeletingGoal(null)}
      />
    </div>
  );
};
