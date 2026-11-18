import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, Plus, CreditCard } from 'lucide-react';
import { FinanceState, NavSection, Transaction } from '../types/finance';
import { getCategoryById } from '../data/categories';
import {
  formatDayLabel,
  formatJPY,
  formatMonthLabel,
  formatShortDate,
  formatSignedJPY,
  getCurrentMonthKey,
  getRecentMonths,
  shiftMonth,
} from '../utils/format';
import { computeCreditCardSummary } from '../utils/creditCard';

interface DashboardViewProps {
  state: FinanceState;
  accountBalances: Record<string, number>;
  selectedMonth: string;
  onChangeMonth: (monthKey: string) => void;
  totalAssets: number;
  accountNameMap: Record<string, string>;
  onNavigate: (section: NavSection) => void;
  onOpenAddTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  accountBalances,
  selectedMonth,
  onChangeMonth,
  totalAssets,
  accountNameMap,
  onNavigate,
  onOpenAddTransaction,
  onEditTransaction,
}) => {
  const currentRealMonth = getCurrentMonthKey();
  const prevMonth = shiftMonth(selectedMonth, -1);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const metrics = useMemo(() => {
    let income = 0;
    let expense = 0;
    let prevIncome = 0;
    let prevExpense = 0;
    const categoryExpenseMap: Record<string, number> = {};

    for (const tx of state.transactions) {
      const m = tx.date.slice(0, 7);
      if (m === selectedMonth) {
        if (tx.type === 'income') {
          income += tx.amount;
        } else if (tx.type === 'expense') {
          expense += tx.amount;
          categoryExpenseMap[tx.categoryId] =
            (categoryExpenseMap[tx.categoryId] ?? 0) + tx.amount;
        } else if (tx.type === 'transfer' && (tx.transferFee ?? 0) > 0) {
          const fee = tx.transferFee ?? 0;
          expense += fee;
          categoryExpenseMap['transfer_fee'] =
            (categoryExpenseMap['transfer_fee'] ?? 0) + fee;
        }
      } else if (m === prevMonth) {
        if (tx.type === 'income') prevIncome += tx.amount;
        else if (tx.type === 'expense') prevExpense += tx.amount;
        else if (tx.type === 'transfer' && (tx.transferFee ?? 0) > 0) {
          prevExpense += tx.transferFee ?? 0;
        }
      }
    }

    const net = income - expense;
    const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
    const expenseDiff = expense - prevExpense;
    const incomeDiff = income - prevIncome;

    const categoryBreakdown = Object.entries(categoryExpenseMap)
      .map(([catId, amount]) => ({
        category:
          catId === 'transfer_fee'
            ? { id: 'transfer_fee', name: '振替・振込手数料', color: '#64748B' }
            : getCategoryById(catId),
        amount,
        share: expense > 0 ? (amount / expense) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      income,
      expense,
      net,
      savingsRate,
      prevIncome,
      prevExpense,
      expenseDiff,
      incomeDiff,
      categoryBreakdown,
    };
  }, [state.transactions, selectedMonth, prevMonth]);

  const trendData = useMemo(() => {
    const months = getRecentMonths(selectedMonth, 6);
    const map: Record<string, { income: number; expense: number }> = {};
    for (const m of months) {
      map[m] = { income: 0, expense: 0 };
    }
    for (const tx of state.transactions) {
      const m = tx.date.slice(0, 7);
      if (map[m]) {
        if (tx.type === 'income') map[m].income += tx.amount;
        else if (tx.type === 'expense') map[m].expense += tx.amount;
        else if (tx.type === 'transfer' && (tx.transferFee ?? 0) > 0) {
          map[m].expense += tx.transferFee ?? 0;
        }
      }
    }
    const items = months.map((m) => ({
      monthKey: m,
      shortLabel: `${Number(m.slice(5, 7))}月`,
      fullLabel: formatMonthLabel(m),
      income: map[m].income,
      expense: map[m].expense,
      net: map[m].income - map[m].expense,
    }));
    const maxVal = Math.max(
      100000,
      ...items.map((i) => Math.max(i.income, i.expense))
    );
    return { items, maxVal };
  }, [state.transactions, selectedMonth]);

  const cardSummaries = useMemo(() => {
    return state.accounts
      .filter((a) => a.type === 'credit')
      .map((card) =>
        computeCreditCardSummary(
          card,
          state.transactions,
          accountBalances[card.id] ?? 0,
          selectedMonth
        )
      );
  }, [state.accounts, state.transactions, accountBalances, selectedMonth]);

  const budgetStatuses = useMemo(() => {
    const spentByCategory: Record<string, number> = {};
    for (const tx of state.transactions) {
      if (tx.type === 'expense' && tx.date.slice(0, 7) === selectedMonth) {
        spentByCategory[tx.categoryId] =
          (spentByCategory[tx.categoryId] ?? 0) + tx.amount;
      }
    }
    return state.budgets
      .map((b) => {
        const spent = spentByCategory[b.categoryId] ?? 0;
        const ratio = b.monthlyLimit > 0 ? spent / b.monthlyLimit : 0;
        return {
          category: getCategoryById(b.categoryId),
          limit: b.monthlyLimit,
          spent,
          remaining: b.monthlyLimit - spent,
          ratio,
        };
      })
      .sort((a, b) => b.ratio - a.ratio);
  }, [state.budgets, state.transactions, selectedMonth]);

  const recentTransactions = useMemo(() => {
    return state.transactions
      .filter((tx) => tx.date.slice(0, 7) === selectedMonth)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7);
  }, [state.transactions, selectedMonth]);

  const activeTrendPoint =
    trendData.items.find((i) => i.monthKey === hoveredMonth) ??
    trendData.items[trendData.items.length - 1];

  return (
    <div className="space-y-8">
      {/* Workspace Toolbar: Month Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {formatMonthLabel(selectedMonth)}の収支サマリー
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            個人・事業をまとめた月間キャッシュフローと口座・カードの状況です
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => onChangeMonth(shiftMonth(selectedMonth, -1))}
              className="rounded-l-lg p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              aria-label="前の月"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[108px] px-3 text-center font-mono text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">
              {formatMonthLabel(selectedMonth)}
            </span>
            <button
              type="button"
              onClick={() => onChangeMonth(shiftMonth(selectedMonth, 1))}
              className="rounded-r-lg p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              aria-label="次の月"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {selectedMonth !== currentRealMonth && (
            <button
              type="button"
              onClick={() => onChangeMonth(currentRealMonth)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              今月に戻す
            </button>
          )}
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <section
        aria-label="主要財務指標"
        className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4"
      >
        <div className="p-6">
          <div className="text-xs font-medium text-slate-500">今月の収入</div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {formatJPY(metrics.income)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            前月比{' '}
            <span
              className={
                metrics.incomeDiff >= 0
                  ? 'font-medium text-emerald-700'
                  : 'font-medium text-slate-700'
              }
            >
              {metrics.incomeDiff >= 0 ? '+' : ''}
              {formatJPY(metrics.incomeDiff)}
            </span>
          </div>
        </div>

        <div className="p-6">
          <div className="text-xs font-medium text-slate-500">今月の支出（手数料含む）</div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {formatJPY(metrics.expense)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            前月比{' '}
            <span
              className={
                metrics.expenseDiff <= 0
                  ? 'font-medium text-emerald-700'
                  : 'font-medium text-red-600'
              }
            >
              {metrics.expenseDiff > 0 ? '+' : ''}
              {formatJPY(metrics.expenseDiff)}
            </span>
          </div>
        </div>

        <div className="p-6 sm:border-t sm:border-slate-200 lg:border-t-0">
          <div className="text-xs font-medium text-slate-500">月間収支（貯蓄額）</div>
          <div
            className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums ${
              metrics.net >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {metrics.net >= 0 ? `+${formatJPY(metrics.net)}` : formatJPY(metrics.net)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            {metrics.income > 0 ? `貯蓄率 ${metrics.savingsRate}%` : '収入データなし'}
          </div>
        </div>

        <div className="p-6 sm:border-t sm:border-slate-200 lg:border-t-0">
          <div className="text-xs font-medium text-slate-500">総資産残高</div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {formatJPY(totalAssets)}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => onNavigate('accounts')}
              className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline"
            >
              <span>{state.accounts.length}つの口座内訳を見る</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </section>

      {/* Credit Card Quick Status Strip */}
      {cardSummaries.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">
                クレジットカード請求予定・利用枠
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('accounts')}
              className="text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
            >
              カード詳細・先払い管理 →
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {cardSummaries.map((s) => (
              <div
                key={s.card.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 break-words">
                    {s.card.name}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {formatDayLabel(s.card.closingDay)}締め ·{' '}
                    {s.card.paymentMonthOffset === 2 ? '翌々月' : '翌月'}
                    {formatDayLabel(s.card.paymentDay)}払い
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs tabular-nums">
                  <div>
                    <div className="text-slate-500">今月引落</div>
                    <div className="text-sm font-bold text-slate-900">
                      {formatJPY(s.thisMonthRemaining)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">来月予定</div>
                    <div className="text-sm font-bold text-slate-700">
                      {formatJPY(s.nextMonthRemaining)}
                    </div>
                  </div>
                  {s.creditLimit > 0 && (
                    <div>
                      <div className="text-slate-500">残り枠</div>
                      <div className="text-sm font-bold text-teal-800">
                        {formatJPY(s.availableCredit)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Analytics Row: 6-Month Cashflow Chart + Category Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">6ヶ月間の収支推移</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                棒グラフをクリックすると該当月へ切り替わります
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-teal-700" aria-hidden="true" />
                収入
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-slate-300" aria-hidden="true" />
                支出
              </span>
            </div>
          </div>

          {activeTrendPoint && (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <span className="font-semibold text-slate-900">
                {activeTrendPoint.fullLabel}
              </span>
              <span className="text-slate-600 tabular-nums">
                収入:{' '}
                <strong className="font-mono text-teal-800">
                  {formatJPY(activeTrendPoint.income)}
                </strong>
              </span>
              <span className="text-slate-600 tabular-nums">
                支出:{' '}
                <strong className="font-mono text-slate-900">
                  {formatJPY(activeTrendPoint.expense)}
                </strong>
              </span>
              <span className="text-slate-600 tabular-nums">
                収支:{' '}
                <strong
                  className={`font-mono ${
                    activeTrendPoint.net >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {activeTrendPoint.net >= 0
                    ? `+${formatJPY(activeTrendPoint.net)}`
                    : formatJPY(activeTrendPoint.net)}
                </strong>
              </span>
            </div>
          )}

          <div className="mt-5">
            <svg
              viewBox="0 0 620 228"
              className="h-56 w-full"
              role="img"
              aria-label="6ヶ月間の収入と支出の棒グラフ"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = 186 - ratio * 158;
                const val = Math.round(trendData.maxVal * ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1="68"
                      x2="604"
                      y1={y}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeDasharray={ratio === 0 ? undefined : '3 3'}
                      strokeWidth="1"
                    />
                    <text
                      x="60"
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 font-mono text-[11px]"
                    >
                      {val === 0 ? '¥0' : `¥${Math.round(val / 10000)}万`}
                    </text>
                  </g>
                );
              })}

              {trendData.items.map((item, idx) => {
                const groupWidth = (604 - 76) / trendData.items.length;
                const centerX = 76 + groupWidth * idx + groupWidth / 2;
                const barWidth = 22;
                const gap = 5;

                const incH = Math.max(
                  item.income > 0 ? 3 : 0,
                  (item.income / trendData.maxVal) * 158
                );
                const expH = Math.max(
                  item.expense > 0 ? 3 : 0,
                  (item.expense / trendData.maxVal) * 158
                );
                const isSelected = item.monthKey === selectedMonth;
                const isHovered = item.monthKey === hoveredMonth;

                return (
                  <g
                    key={item.monthKey}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredMonth(item.monthKey)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    onClick={() => onChangeMonth(item.monthKey)}
                  >
                    <rect
                      x={centerX - groupWidth / 2 + 4}
                      y={20}
                      width={groupWidth - 8}
                      height={172}
                      rx="6"
                      fill={isHovered || isSelected ? '#F8FAFC' : 'transparent'}
                    />
                    <rect
                      x={centerX - barWidth - gap / 2}
                      y={186 - incH}
                      width={barWidth}
                      height={incH}
                      rx="3"
                      fill={isSelected || isHovered ? '#0F766E' : '#14B8A6'}
                    />
                    <rect
                      x={centerX + gap / 2}
                      y={186 - expH}
                      width={barWidth}
                      height={expH}
                      rx="3"
                      fill={isSelected || isHovered ? '#475569' : '#CBD5E1'}
                    />
                    <text
                      x={centerX}
                      y={212}
                      textAnchor="middle"
                      className={`text-[12px] ${
                        isSelected
                          ? 'fill-slate-900 font-semibold'
                          : 'fill-slate-500 font-normal'
                      }`}
                    >
                      {item.shortLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>

        {/* Expense Category Breakdown */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">カテゴリ別支出</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatMonthLabel(selectedMonth)}の支出構成比
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
            >
              円グラフで詳しく →
            </button>
          </div>

          {metrics.categoryBreakdown.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center text-center">
              <p className="text-sm text-slate-500">この月の支出データはまだありません</p>
              <button
                type="button"
                onClick={onOpenAddTransaction}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>支出を記録する</span>
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {metrics.categoryBreakdown.slice(0, 6).map((item) => (
                <div key={item.category.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
                    <span className="font-medium text-slate-800">{item.category.name}</span>
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="text-slate-400">{Math.round(item.share)}%</span>
                      <span className="font-semibold text-slate-900">
                        {formatJPY(item.amount)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(3, item.share))}%`,
                        backgroundColor: item.category.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Bottom Row: Recent Transactions & Budget Watchlist */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h3 className="text-base font-semibold text-slate-900">
              {formatMonthLabel(selectedMonth)}の主な取引
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
            >
              すべて見る →
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate-500">
                {formatMonthLabel(selectedMonth)}の取引記録がありません。
              </p>
              <button
                type="button"
                onClick={onOpenAddTransaction}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>最初の収支を記録</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentTransactions.map((tx) => {
                const cat = getCategoryById(tx.categoryId);
                const accName = accountNameMap[tx.accountId] ?? '口座';
                const toAccName = tx.toAccountId
                  ? accountNameMap[tx.toAccountId] ?? '口座'
                  : '';
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => onEditTransaction(tx)}
                    className="flex w-full items-start justify-between gap-4 px-6 py-3.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug text-slate-900 break-words">
                        {tx.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-relaxed text-slate-500">
                        <span className="tabular-nums">{formatShortDate(tx.date)}</span>
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
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={`font-mono text-sm font-semibold tabular-nums ${
                          tx.type === 'income'
                            ? 'text-emerald-700'
                            : tx.type === 'expense'
                            ? 'text-slate-900'
                            : 'text-slate-500'
                        }`}
                      >
                        {formatSignedJPY(tx.amount, tx.type)}
                      </div>
                      {tx.type === 'transfer' && (tx.transferFee ?? 0) > 0 && (
                        <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                          手数料 {formatJPY(tx.transferFee ?? 0)}
                        </div>
                      )}
                      {tx.type === 'expense' && (tx.pointUsed ?? 0) > 0 && (
                        <div className="font-mono text-[11px] text-teal-700 tabular-nums">
                          P充当 {formatJPY(tx.pointUsed ?? 0)}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Budget Watchlist */}
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h3 className="text-base font-semibold text-slate-900">予算の進捗</h3>
            <button
              type="button"
              onClick={() => onNavigate('budgets')}
              className="text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
            >
              予算を設定 →
            </button>
          </div>

          {budgetStatuses.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate-500">カテゴリ別の予算が設定されていません。</p>
              <button
                type="button"
                onClick={() => onNavigate('budgets')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                予算を追加する
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {budgetStatuses.slice(0, 5).map((item) => {
                const pct = Math.round(item.ratio * 100);
                const statusLabel =
                  item.ratio > 1 ? '予算超過' : item.ratio >= 0.8 ? '残りわずか' : '予算内';
                const barColor =
                  item.ratio > 1
                    ? 'bg-red-600'
                    : item.ratio >= 0.8
                    ? 'bg-amber-500'
                    : 'bg-teal-700';
                const textStatusColor =
                  item.ratio > 1
                    ? 'text-red-600'
                    : item.ratio >= 0.8
                    ? 'text-amber-700'
                    : 'text-emerald-700';

                return (
                  <div key={item.category.id} className="px-6 py-3.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-900">
                          {item.category.name}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className={`font-medium ${textStatusColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <span className="font-mono text-slate-600 tabular-nums">
                        {formatJPY(item.spent)} / {formatJPY(item.limit)} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
