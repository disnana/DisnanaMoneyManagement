import React, { useMemo, useState } from 'react';
import { ChevronRight, Plus, CreditCard } from 'lucide-react';
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
  getTransferTotalFees,
  shiftMonth,
} from '../utils/format';
import { computeCreditCardSummary } from '../utils/creditCard';
import { MonthSwitcherBar } from './MonthSwitcherBar';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { haptic } from '../utils/haptics';
import {
  CategoryBadge,
  InsetGroup,
  SectionHeader,
  TxRowBody,
} from './mobile/MobileKit';

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
  const isDesktop = useIsDesktop();
  const currentRealMonth = getCurrentMonthKey();
  const prevMonth = shiftMonth(selectedMonth, -1);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const [chartPreviewMonth, setChartPreviewMonth] = useState<string>(currentRealMonth);

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
        } else if (tx.type === 'transfer') {
          const fee = getTransferTotalFees(tx);
          if (fee > 0) {
            expense += fee;
            categoryExpenseMap['transfer_fee'] =
              (categoryExpenseMap['transfer_fee'] ?? 0) + fee;
          }
        }
      } else if (m === prevMonth) {
        if (tx.type === 'income') prevIncome += tx.amount;
        else if (tx.type === 'expense') prevExpense += tx.amount;
        else if (tx.type === 'transfer') {
          prevExpense += getTransferTotalFees(tx);
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
    const months = getRecentMonths(currentRealMonth, 6);
    const map: Record<string, { income: number; expense: number }> = {};
    for (const m of months) {
      map[m] = { income: 0, expense: 0 };
    }
    for (const tx of state.transactions) {
      const m = tx.date.slice(0, 7);
      if (map[m]) {
        if (tx.type === 'income') map[m].income += tx.amount;
        else if (tx.type === 'expense') map[m].expense += tx.amount;
        else if (tx.type === 'transfer') {
          const fee = getTransferTotalFees(tx);
          if (fee > 0) map[m].expense += fee;
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
  }, [state.transactions, currentRealMonth]);

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
    trendData.items.find((i) => i.monthKey === chartPreviewMonth) ??
    trendData.items[trendData.items.length - 1];

  const chartsRow = (
    <>
      {/* Main Analytics Row: 6-Month Cashflow Chart + Category Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">6ヶ月間の収支推移</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                今月を含む直近6ヶ月固定 · 棒や月ボタンをタップで詳細数値を確認
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
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
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

          <div className="mt-4">
            <svg
              viewBox="0 0 620 228"
              className="h-52 w-full sm:h-56"
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
                const isSelected = item.monthKey === chartPreviewMonth;
                const isHovered = item.monthKey === hoveredMonth;

                return (
                  <g
                    key={item.monthKey}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredMonth(item.monthKey)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    onClick={() => setChartPreviewMonth(item.monthKey)}
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

          {/* Touch-friendly month selector buttons */}
          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {trendData.items.map((item) => {
              const isSelected = item.monthKey === chartPreviewMonth;
              return (
                <button
                  key={item.monthKey}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setChartPreviewMonth(item.monthKey)}
                  className={`flex min-h-[44px] flex-col items-center justify-center rounded-lg border px-1.5 py-1 text-center transition-all active:scale-95 ${
                    isSelected
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-[11px] font-semibold whitespace-nowrap">
                    {item.shortLabel}
                  </span>
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      item.net >= 0 ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {item.net >= 0 ? '+' : ''}
                    {Math.round(item.net / 1000)}k
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Expense Category Breakdown */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 lg:col-span-5">
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
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-teal-700 transition-all hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
            >
              <span>円グラフで詳しく</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          </div>

          {metrics.categoryBreakdown.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center text-center">
              <p className="text-sm text-slate-500">この月の支出データはまだありません</p>
              <button
                type="button"
                onClick={onOpenAddTransaction}
                className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
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
    </>
  );

  if (!isDesktop) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6">
        {/* Month bar */}
        <div className="flex items-center gap-2">
          <MonthSwitcherBar
            selectedMonth={selectedMonth}
            onChangeMonth={onChangeMonth}
            className="flex-1"
          />
          {selectedMonth !== currentRealMonth && (
            <button
              type="button"
              onClick={() => onChangeMonth(currentRealMonth)}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-teal-50 px-3.5 text-xs font-bold text-teal-800 active:scale-95"
            >
              今月へ
            </button>
          )}
        </div>

        {/* Hero */}
        <section
          aria-label="主要財務指標"
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-teal-700 to-teal-900 p-5 text-white shadow-lg shadow-teal-900/20"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl"
          />
          <button
            type="button"
            onClick={() => {
              haptic(6);
              onNavigate('accounts');
            }}
            className="relative block w-full text-left active:opacity-80"
          >
            <div className="flex items-center justify-between text-xs font-medium text-teal-100">
              <span>総資産残高 · {state.accounts.length}口座</span>
              <ChevronRight className="h-4 w-4" />
            </div>
            <div className="mt-1 font-mono text-[34px] font-bold leading-tight tracking-tight tabular-nums">
              {formatJPY(totalAssets)}
            </div>
          </button>

          <div className="relative mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-black/15 p-3 backdrop-blur-sm">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-teal-100">収入</div>
              <div className="truncate font-mono text-[15px] font-bold tabular-nums">
                {formatJPY(metrics.income)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-teal-100">支出</div>
              <div className="truncate font-mono text-[15px] font-bold tabular-nums">
                {formatJPY(metrics.expense)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-teal-100">収支</div>
              <div
                className={`truncate font-mono text-[15px] font-bold tabular-nums ${
                  metrics.net >= 0 ? 'text-emerald-200' : 'text-red-200'
                }`}
              >
                {metrics.net >= 0 ? '+' : ''}
                {formatJPY(metrics.net)}
              </div>
            </div>
          </div>
          <div className="relative mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-teal-100 tabular-nums">
            <span>
              収入 前月比 {metrics.incomeDiff >= 0 ? '+' : ''}
              {formatJPY(metrics.incomeDiff)}
            </span>
            <span>
              支出 前月比 {metrics.expenseDiff > 0 ? '+' : ''}
              {formatJPY(metrics.expenseDiff)}
            </span>
            {metrics.income > 0 && <span>貯蓄率 {metrics.savingsRate}%</span>}
          </div>
        </section>

        {/* Credit cards carousel */}
        {cardSummaries.length > 0 && (
          <section>
            <SectionHeader
              title="クレジットカード"
              actionLabel="詳細"
              onAction={() => onNavigate('accounts')}
            />
            <div
              data-no-tab-swipe="true"
              className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {cardSummaries.map((s) => {
                const used =
                  s.creditLimit > 0
                    ? Math.min(100, Math.round(((s.creditLimit - s.availableCredit) / s.creditLimit) * 100))
                    : 0;
                return (
                  <button
                    key={s.card.id}
                    type="button"
                    onClick={() => onNavigate('accounts')}
                    className="w-[78%] max-w-[300px] shrink-0 snap-start rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200/70 transition-transform active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <CreditCard className="h-4 w-4 text-teal-700" />
                      <span className="truncate">{s.card.name}</span>
                    </div>
                    <div className="mt-3 text-[11px] text-slate-500">今月引落</div>
                    <div className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                      {formatJPY(s.thisMonthRemaining)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {formatDayLabel(s.card.closingDay)}締め ·{' '}
                      {s.card.paymentMonthOffset === 2 ? '翌々月' : '翌月'}
                      {formatDayLabel(s.card.paymentDay)}払い
                    </div>
                    <div className="mt-3 flex items-center justify-between font-mono text-[11px] tabular-nums text-slate-600">
                      <span>来月 {formatJPY(s.nextMonthRemaining)}</span>
                      {s.creditLimit > 0 && (
                        <span className="text-teal-800">残り枠 {formatJPY(s.availableCredit)}</span>
                      )}
                    </div>
                    {s.creditLimit > 0 && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${used >= 80 ? 'bg-amber-500' : 'bg-teal-700'}`}
                          style={{ width: `${used}%` }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent transactions */}
        <section>
          <SectionHeader
            title={`${formatMonthLabel(selectedMonth)}の主な取引`}
            actionLabel="すべて"
            onAction={() => onNavigate('transactions')}
          />
          {recentTransactions.length === 0 ? (
            <InsetGroup className="px-6 py-10 text-center">
              <p className="text-sm text-slate-500">この月の取引はまだありません</p>
              <button
                type="button"
                onClick={onOpenAddTransaction}
                className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-700 px-5 text-xs font-semibold text-white active:scale-95"
              >
                <Plus className="h-4 w-4" />
                最初の収支を記録
              </button>
            </InsetGroup>
          ) : (
            <InsetGroup className="divide-y divide-slate-100">
              {recentTransactions.map((tx) => {
                const cat = getCategoryById(tx.categoryId);
                const acc = accountNameMap[tx.accountId] ?? '口座';
                const to = tx.toAccountId ? accountNameMap[tx.toAccountId] ?? '口座' : '';
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => onEditTransaction(tx)}
                    className="block w-full transition-colors active:bg-slate-50"
                  >
                    <TxRowBody
                      tx={tx}
                      category={cat}
                      accountLabel={
                        tx.type === 'transfer'
                          ? `${acc} → ${to}`
                          : `${formatShortDate(tx.date)} · ${cat.name}`
                      }
                    />
                  </button>
                );
              })}
            </InsetGroup>
          )}
        </section>

        {/* Budgets */}
        <section>
          <SectionHeader
            title="予算の進捗"
            actionLabel={budgetStatuses.length === 0 ? '設定する' : '管理'}
            onAction={() => onNavigate('budgets')}
          />
          {budgetStatuses.length === 0 ? (
            <InsetGroup className="px-6 py-8 text-center text-sm text-slate-500">
              カテゴリ別の予算が未設定です
            </InsetGroup>
          ) : (
            <InsetGroup className="divide-y divide-slate-100">
              {budgetStatuses.slice(0, 5).map((item) => {
                const pct = Math.round(item.ratio * 100);
                const bar =
                  item.ratio > 1 ? 'bg-red-600' : item.ratio >= 0.8 ? 'bg-amber-500' : 'bg-teal-700';
                return (
                  <button
                    key={item.category.id}
                    type="button"
                    onClick={() => onNavigate('budgets')}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
                  >
                    <CategoryBadge category={item.category} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="truncate font-semibold text-slate-900">
                          {item.category.name}
                        </span>
                        <span
                          className={`shrink-0 font-mono text-xs font-bold tabular-nums ${
                            item.ratio > 1 ? 'text-red-600' : 'text-slate-600'
                          }`}
                        >
                          {pct}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${bar}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                        {formatJPY(item.spent)} / {formatJPY(item.limit)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </InsetGroup>
          )}
        </section>

        {chartsRow}
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Workspace Toolbar: Month Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            {formatMonthLabel(selectedMonth)}の収支サマリー
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
            個人・事業をまとめた月間キャッシュフローと口座・カードの状況です
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MonthSwitcherBar
            selectedMonth={selectedMonth}
            onChangeMonth={onChangeMonth}
            className="flex-1 sm:flex-initial"
          />
          {selectedMonth !== currentRealMonth && (
            <button
              type="button"
              onClick={() => onChangeMonth(currentRealMonth)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
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
        <div className="p-4 sm:p-6">
          <div className="text-xs font-medium text-slate-500">今月の収入</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {formatJPY(metrics.income)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
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

        <div className="p-4 sm:p-6">
          <div className="text-xs font-medium text-slate-500">今月の支出（手数料含む）</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {formatJPY(metrics.expense)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
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

        <div className="p-4 sm:border-t sm:border-slate-200 sm:p-6 lg:border-t-0">
          <div className="text-xs font-medium text-slate-500">月間収支（貯蓄額）</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-bold tracking-tight tabular-nums ${
              metrics.net >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {metrics.net >= 0 ? `+${formatJPY(metrics.net)}` : formatJPY(metrics.net)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {metrics.income > 0 ? `貯蓄率 ${metrics.savingsRate}%` : '収入データなし'}
          </div>
        </div>

        <div className="p-4 sm:border-t sm:border-slate-200 sm:p-6 lg:border-t-0">
          <div className="text-xs font-medium text-slate-500">総資産残高</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {formatJPY(totalAssets)}
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onNavigate('accounts')}
              className="inline-flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-xs font-semibold text-teal-700 transition-all hover:bg-slate-100 active:scale-[0.98]"
            >
              <span>{state.accounts.length}つの口座内訳を見る</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          </div>
        </div>
      </section>

      {/* Credit Card Quick Status Strip */}
      {cardSummaries.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 shrink-0 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">
                クレジットカード請求予定・利用枠
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('accounts')}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-teal-700 transition-all hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
            >
              <span>カード詳細・先払い管理</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            {cardSummaries.map((s) => (
              <button
                key={s.card.id}
                type="button"
                onClick={() => onNavigate('accounts')}
                className="flex min-h-[64px] w-full flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3.5 text-left transition-all hover:border-slate-300 hover:bg-slate-100/70 active:scale-[0.99] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 break-words">
                      {s.card.name}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 sm:hidden" />
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {formatDayLabel(s.card.closingDay)}締め ·{' '}
                    {s.card.paymentMonthOffset === 2 ? '翌々月' : '翌月'}
                    {formatDayLabel(s.card.paymentDay)}払い
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 font-mono text-xs tabular-nums sm:flex sm:items-center sm:gap-5">
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
              </button>
            ))}
          </div>
        </section>
      )}

      {chartsRow}

      {/* Bottom Row: Recent Transactions & Budget Watchlist */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-7">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4">
            <h3 className="text-base font-semibold text-slate-900">
              {formatMonthLabel(selectedMonth)}の主な取引
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-teal-700 transition-all hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
            >
              <span>すべて見る</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
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
                className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-700 px-5 text-xs font-semibold text-white transition-all hover:bg-teal-800 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
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
                    className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70 sm:px-6"
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
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
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
                        {tx.type === 'transfer' && getTransferTotalFees(tx) > 0 && (
                          <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                            手数料 {formatJPY(getTransferTotalFees(tx))}
                          </div>
                        )}
                        {tx.type === 'expense' && (tx.pointUsed ?? 0) > 0 && (
                          <div className="font-mono text-[11px] text-teal-700 tabular-nums">
                            P充当 {formatJPY(tx.pointUsed ?? 0)}
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

        {/* Budget Watchlist */}
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4">
            <h3 className="text-base font-semibold text-slate-900">予算の進捗</h3>
            <button
              type="button"
              onClick={() => onNavigate('budgets')}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-teal-700 transition-all hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
            >
              <span>予算を設定</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          </div>

          {budgetStatuses.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate-500">カテゴリ別の予算が設定されていません。</p>
              <button
                type="button"
                onClick={() => onNavigate('budgets')}
                className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                <span>予算を追加する</span>
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
                  <button
                    key={item.category.id}
                    type="button"
                    onClick={() => onNavigate('budgets')}
                    className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70 sm:px-6"
                  >
                    <div className="min-w-0 flex-1">
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
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
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

