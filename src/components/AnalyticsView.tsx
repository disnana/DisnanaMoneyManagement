import React, { useMemo, useState } from 'react';
import { FinanceState, TransactionScope } from '../types/finance';
import {
  INCOME_TAX_CATEGORY_LABELS,
  RECEIPT_METHOD_LABELS,
  getCategoryById,
} from '../data/categories';
import {
  formatJPY,
  formatMonthLabel,
  getCurrentMonthKey,
  getDeductibleBusinessAmount,
  getEffectiveOutflow,
  getRecentMonths,
  getTransferTotalFees,
} from '../utils/format';
import { MonthSwitcherBar } from './MonthSwitcherBar';
import { Segmented } from './mobile/MobileKit';
import { useIsDesktop } from '../hooks/useMediaQuery';

interface AnalyticsViewProps {
  state: FinanceState;
  selectedMonth: string;
  onChangeMonth: (monthKey: string) => void;
  accountNameMap: Record<string, string>;
}

interface DonutSlice {
  id: string;
  label: string;
  value: number;
  color: string;
  percentage: number;
}

const CHART_PALETTE = [
  '#0F766E',
  '#0284C7',
  '#4F46E5',
  '#D97706',
  '#059669',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#334155',
  '#64748B',
];

const DonutChart: React.FC<{
  title: string;
  subtitle: string;
  centerLabel: string;
  slices: DonutSlice[];
}> = ({ title, subtitle, centerLabel, slices }) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const total = useMemo(() => slices.reduce((s, x) => s + x.value, 0), [slices]);

  const radius = 82;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    let cumulative = 0;
    return slices.map((slice) => {
      const ratio = total > 0 ? slice.value / total : 0;
      const strokeLength = ratio * circumference;
      const offset = -cumulative * circumference;
      cumulative += ratio;
      return {
        ...slice,
        strokeLength,
        offset,
      };
    });
  }, [slices, total, circumference]);

  const activeSlice = slices.find((s) => s.id === activeId) ?? null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="border-b border-slate-100 pb-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>

      {total === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          対象期間のデータがありません
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 items-center gap-6 sm:grid-cols-12">
          <div className="flex justify-center sm:col-span-5">
            <div className="relative h-52 w-52 sm:h-56 sm:w-56">
              <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
                <circle
                  cx="110"
                  cy="110"
                  r={radius}
                  fill="none"
                  stroke="#F1F5F9"
                  strokeWidth="22"
                />
                {segments.map((seg) => {
                  const isActive = activeId === seg.id;
                  const dimmed = activeId !== null && !isActive;
                  return (
                    <circle
                      key={seg.id}
                      cx="110"
                      cy="110"
                      r={radius}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={isActive ? 26 : 22}
                      strokeDasharray={`${seg.strokeLength} ${circumference}`}
                      strokeDashoffset={seg.offset}
                      className="cursor-pointer transition-all duration-150"
                      style={{ opacity: dimmed ? 0.35 : 1 }}
                      onMouseEnter={() => setActiveId(seg.id)}
                      onMouseLeave={() => setActiveId(null)}
                      onClick={() => setActiveId(isActive ? null : seg.id)}
                    />
                  );
                })}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-7 text-center">
                <span className="line-clamp-2 text-[11px] font-medium leading-tight text-slate-500">
                  {activeSlice ? activeSlice.label : centerLabel}
                </span>
                <span className="mt-1 font-mono text-sm font-bold text-slate-900 tabular-nums sm:text-base">
                  {formatJPY(activeSlice ? activeSlice.value : total)}
                </span>
                {activeSlice && (
                  <span className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                    {activeSlice.percentage.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1 sm:col-span-7">
            {slices.slice(0, 10).map((slice) => {
              const isActive = activeId === slice.id;
              return (
                <button
                  key={slice.id}
                  type="button"
                  onMouseEnter={() => setActiveId(slice.id)}
                  onMouseLeave={() => setActiveId(null)}
                  onClick={() => setActiveId(isActive ? null : slice.id)}
                  aria-pressed={isActive}
                  className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition-all active:scale-[0.99] ${
                    isActive
                      ? 'bg-slate-100 ring-1 ring-slate-200'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-3 w-3 shrink-0 rounded-xs"
                      style={{ backgroundColor: slice.color }}
                      aria-hidden="true"
                    />
                    <span className="font-medium leading-snug text-slate-800 break-words">
                      {slice.label}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5 font-mono tabular-nums">
                    <span className="text-slate-400">{slice.percentage.toFixed(1)}%</span>
                    <span className="font-semibold text-slate-900">
                      {formatJPY(slice.value)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  state,
  selectedMonth,
  onChangeMonth,
  accountNameMap,
}) => {
  const currentRealMonth = getCurrentMonthKey();
  const isDesktop = useIsDesktop();
  const [periodMode, setPeriodMode] = useState<'month' | '6months' | 'year'>('month');
  const [scopeFilter, setScopeFilter] = useState<'all' | TransactionScope>('all');
  const [trendPreviewMonth, setTrendPreviewMonth] = useState<string>(currentRealMonth);

  const selectedYear = selectedMonth.slice(0, 4);

  const scopedTransactions = useMemo(() => {
    const recent6 = new Set(getRecentMonths(selectedMonth, 6));
    return state.transactions.filter((tx) => {
      if (scopeFilter !== 'all' && (tx.scope ?? 'personal') !== scopeFilter) {
        return false;
      }
      const m = tx.date.slice(0, 7);
      if (periodMode === 'month') return m === selectedMonth;
      if (periodMode === '6months') return recent6.has(m);
      return tx.date.slice(0, 4) === selectedYear;
    });
  }, [state.transactions, periodMode, selectedMonth, selectedYear, scopeFilter]);

  const analyticsSummary = useMemo(() => {
    let grossExpense = 0;
    let pointSaved = 0;
    let transferFees = 0;
    let totalIncome = 0;
    let businessDeductible = 0;
    let personalExpense = 0;

    const expByCategory: Record<string, number> = {};
    const incByTaxType: Record<string, number> = {};
    const incByReceiptMethod: Record<string, number> = {};
    const expByAccount: Record<string, number> = {};

    for (const tx of scopedTransactions) {
      if (tx.type === 'expense') {
        grossExpense += tx.amount;
        pointSaved += tx.pointUsed ?? 0;
        const deductible = getDeductibleBusinessAmount(tx);
        businessDeductible += deductible;
        personalExpense += Math.max(0, tx.amount - deductible);

        expByCategory[tx.categoryId] = (expByCategory[tx.categoryId] ?? 0) + tx.amount;
        expByAccount[tx.accountId] =
          (expByAccount[tx.accountId] ?? 0) + getEffectiveOutflow(tx);
      } else if (tx.type === 'transfer') {
        const fee = getTransferTotalFees(tx);
        if (fee > 0) {
          transferFees += fee;
          if (tx.scope === 'business') {
            businessDeductible += fee;
          } else {
            personalExpense += fee;
          }
          expByCategory['transfer_fee'] = (expByCategory['transfer_fee'] ?? 0) + fee;
        }
      } else if (tx.type === 'income') {
        totalIncome += tx.amount;
        const taxKey = tx.incomeTaxCategory ?? 'other';
        incByTaxType[taxKey] = (incByTaxType[taxKey] ?? 0) + tx.amount;
        const recKey = tx.receiptMethod ?? 'bank_transfer';
        incByReceiptMethod[recKey] = (incByReceiptMethod[recKey] ?? 0) + tx.amount;
      }
    }

    const totalOutflow = grossExpense + transferFees;

    const expenseSlices: DonutSlice[] = Object.entries(expByCategory)
      .map(([catId, value], idx) => {
        const cat =
          catId === 'transfer_fee'
            ? { name: '振込・振替手数料', color: '#64748B' }
            : getCategoryById(catId);
        return {
          id: catId,
          label: cat.name,
          value,
          color: cat.color ?? CHART_PALETTE[idx % CHART_PALETTE.length],
          percentage: totalOutflow > 0 ? (value / totalOutflow) * 100 : 0,
        };
      })
      .sort((a, b) => b.value - a.value);

    const incomeSlices: DonutSlice[] = Object.entries(incByTaxType)
      .map(([key, value], idx) => ({
        id: key,
        label:
          INCOME_TAX_CATEGORY_LABELS[key as keyof typeof INCOME_TAX_CATEGORY_LABELS] ??
          'その他収入',
        value,
        color: CHART_PALETTE[idx % CHART_PALETTE.length],
        percentage: totalIncome > 0 ? (value / totalIncome) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    const scopeSlices: DonutSlice[] = [
      {
        id: 'personal',
        label: 'プライベート支出',
        value: personalExpense,
        color: '#64748B',
        percentage: totalOutflow > 0 ? (personalExpense / totalOutflow) * 100 : 0,
      },
      {
        id: 'business',
        label: '事業経費算入分',
        value: businessDeductible,
        color: '#0F766E',
        percentage: totalOutflow > 0 ? (businessDeductible / totalOutflow) * 100 : 0,
      },
    ].filter((s) => s.value > 0);

    const accountBreakdown = Object.entries(expByAccount)
      .map(([accId, value]) => ({
        id: accId,
        name: accountNameMap[accId] ?? '不明な口座',
        value,
      }))
      .sort((a, b) => b.value - a.value);

    const receiptBreakdown = Object.entries(incByReceiptMethod)
      .map(([method, value]) => ({
        id: method,
        name:
          RECEIPT_METHOD_LABELS[method as keyof typeof RECEIPT_METHOD_LABELS] ?? method,
        value,
      }))
      .sort((a, b) => b.value - a.value);

    return {
      totalIncome,
      totalOutflow,
      pointSaved,
      transferFees,
      businessDeductible,
      expenseSlices,
      incomeSlices,
      scopeSlices,
      accountBreakdown,
      receiptBreakdown,
    };
  }, [scopedTransactions, accountNameMap]);

  // 6-Month savings / net flow curve (locked to latest 6 months including current real month)
  const monthlyTrend = useMemo(() => {
    const months = getRecentMonths(currentRealMonth, 6);
    const map: Record<string, { income: number; expense: number }> = {};
    for (const m of months) map[m] = { income: 0, expense: 0 };

    for (const tx of state.transactions) {
      if (scopeFilter !== 'all' && (tx.scope ?? 'personal') !== scopeFilter) continue;
      const m = tx.date.slice(0, 7);
      if (!map[m]) continue;
      if (tx.type === 'income') map[m].income += tx.amount;
      else if (tx.type === 'expense') map[m].expense += tx.amount;
      else if (tx.type === 'transfer') {
        const fee = getTransferTotalFees(tx);
        if (fee > 0) map[m].expense += fee;
      }
    }

    return months.map((m) => ({
      monthKey: m,
      label: `${Number(m.slice(5, 7))}月`,
      fullLabel: formatMonthLabel(m),
      income: map[m].income,
      expense: map[m].expense,
      net: map[m].income - map[m].expense,
    }));
  }, [state.transactions, currentRealMonth, scopeFilter]);

  const maxTrendValue = Math.max(
    100000,
    ...monthlyTrend.map((d) => Math.max(d.income, d.expense, Math.abs(d.net)))
  );

  const activeTrendMonth =
    monthlyTrend.find((d) => d.monthKey === trendPreviewMonth) ??
    monthlyTrend[monthlyTrend.length - 1];

  const periodTitle =
    periodMode === 'month'
      ? formatMonthLabel(selectedMonth)
      : periodMode === '6months'
      ? `${formatMonthLabel(selectedMonth)}までの6ヶ月間`
      : `${selectedYear}年 年間`;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="hidden lg:block">
          <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            収支分析・ポートフォリオ
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
            {periodTitle}のカテゴリ構成・所得区分・支払方法別の割合を可視化します
          </p>
        </div>

        {isDesktop ? (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1 sm:inline-flex">
            {(
              [
                { id: 'month', label: '単月' },
                { id: '6months', label: '6ヶ月' },
                { id: 'year', label: '年間' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriodMode(opt.id)}
                className={`min-h-[40px] rounded-lg px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  periodMode === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1 sm:inline-flex">
            {(
              [
                { id: 'all', label: 'すべて' },
                { id: 'personal', label: '個人' },
                { id: 'business', label: '事業' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScopeFilter(opt.id)}
                className={`min-h-[40px] rounded-lg px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  scopeFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <MonthSwitcherBar
            selectedMonth={selectedMonth}
            onChangeMonth={onChangeMonth}
            className="w-full sm:w-auto"
          />
        </div>
        ) : (
        <div className="space-y-2">
          <Segmented
            layoutId="analytics-period-seg"
            value={periodMode}
            options={[
              { id: 'month', label: '単月' },
              { id: '6months', label: '6ヶ月' },
              { id: 'year', label: '年間' },
            ] as const}
            onChange={setPeriodMode}
          />
          <div className="flex items-center justify-between gap-2">
            <MonthSwitcherBar
              plain
              selectedMonth={selectedMonth}
              onChangeMonth={onChangeMonth}
              className="flex-1"
            />
            <select
              aria-label="区分"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as 'all' | TransactionScope)}
              className="h-10 shrink-0 rounded-lg bg-transparent pl-2 pr-1 text-[15px] font-medium text-teal-700"
            >
              <option value="all">すべて</option>
              <option value="personal">個人</option>
              <option value="business">事業</option>
            </select>
          </div>
        </div>
        )}
      </div>

      {/* Summary Strip */}
      <section className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">総売上・収入 ({periodTitle})</div>
          <div className="mt-1.5 font-mono text-2xl max-sm:text-xl font-bold text-emerald-700 tabular-nums">
            {formatJPY(analyticsSummary.totalIncome)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            純収支（手取り残）{' '}
            <strong
              className={`font-mono ${
                analyticsSummary.totalIncome - analyticsSummary.totalOutflow >= 0
                  ? 'text-teal-800'
                  : 'text-red-600'
              }`}
            >
              {formatJPY(analyticsSummary.totalIncome - analyticsSummary.totalOutflow)}
            </strong>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">総支出（手数料含む）</div>
          <div className="mt-1.5 font-mono text-2xl max-sm:text-xl font-bold text-slate-900 tabular-nums">
            {formatJPY(analyticsSummary.totalOutflow)}
          </div>
          {analyticsSummary.transferFees > 0 && (
            <div className="mt-1 text-xs text-slate-500 tabular-nums">
              うち振替・為替手数料 {formatJPY(analyticsSummary.transferFees)}
            </div>
          )}
        </div>
        <div className="p-4 sm:border-t sm:border-slate-200 sm:p-5 lg:border-t-0">
          <div className="text-xs font-medium text-slate-500">ポイント充当による節約</div>
          <div className="mt-1.5 font-mono text-2xl max-sm:text-xl font-bold text-teal-700 tabular-nums">
            {formatJPY(analyticsSummary.pointSaved)}
          </div>
          <div className="mt-1 text-xs text-slate-500">実請求から控除された額</div>
        </div>
        <div className="p-4 sm:border-t sm:border-slate-200 sm:p-5 lg:border-t-0">
          <div className="text-xs font-medium text-slate-500">事業経費算入額（按分後）</div>
          <div className="mt-1.5 font-mono text-2xl max-sm:text-xl font-bold text-slate-900 tabular-nums">
            {formatJPY(analyticsSummary.businessDeductible)}
          </div>
        </div>
      </section>

      {/* Pie / Donut Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DonutChart
          title="支出カテゴリ構成（円グラフ）"
          subtitle={`${periodTitle}のカテゴリ別割合 · 項目タップでハイライト`}
          centerLabel="支出合計"
          slices={analyticsSummary.expenseSlices}
        />

        <DonutChart
          title="所得区分別 収入構成（円グラフ）"
          subtitle={`${periodTitle}の給与・事業・雑所得などの内訳`}
          centerLabel="収入合計"
          slices={analyticsSummary.incomeSlices}
        />
      </div>

      {/* Second Row: Personal vs Business Donut + Monthly Net Cashflow Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <DonutChart
            title="個人支出 vs 事業経費（按分後）"
            subtitle="家事按分適用後の経費比率"
            centerLabel="支出合計"
            slices={analyticsSummary.scopeSlices}
          />
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                月次純収支（黒字・赤字）トレンド
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                今月を含む直近6ヶ月の収入 − 支出 · タップで詳細数値を確認
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-700" />
                純収支
              </span>
            </div>
          </div>

          {activeTrendMonth && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
              <span className="font-semibold text-slate-900">
                {activeTrendMonth.fullLabel}
              </span>
              <span className="text-slate-600 tabular-nums">
                収入:{' '}
                <strong className="font-mono text-teal-800">
                  {formatJPY(activeTrendMonth.income)}
                </strong>
              </span>
              <span className="text-slate-600 tabular-nums">
                支出:{' '}
                <strong className="font-mono text-slate-900">
                  {formatJPY(activeTrendMonth.expense)}
                </strong>
              </span>
              <span className="text-slate-600 tabular-nums">
                純収支:{' '}
                <strong
                  className={`font-mono ${
                    activeTrendMonth.net >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {activeTrendMonth.net >= 0
                    ? `+${formatJPY(activeTrendMonth.net)}`
                    : formatJPY(activeTrendMonth.net)}
                </strong>
              </span>
            </div>
          )}

          <div className="mt-4">
            <svg viewBox="0 0 600 224" className="h-52 w-full sm:h-56">
              {[0, 0.5, 1].map((r) => {
                const y = 180 - r * 136;
                const val = Math.round(maxTrendValue * r);
                return (
                  <g key={r}>
                    <line
                      x1="66"
                      x2="580"
                      y1={y}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeDasharray={r === 0 ? undefined : '3 3'}
                    />
                    <text
                      x="58"
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 font-mono text-[11px]"
                    >
                      {val === 0 ? '¥0' : `¥${Math.round(val / 10000)}万`}
                    </text>
                  </g>
                );
              })}

              {/* Polyline for Net Cashflow */}
              {monthlyTrend.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#0F766E"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={monthlyTrend
                    .map((d, i) => {
                      const x = 96 + i * ((554 - 96) / (monthlyTrend.length - 1));
                      const clamped = Math.max(0, d.net);
                      const y = 180 - (clamped / maxTrendValue) * 136;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              )}

              {monthlyTrend.map((d, i) => {
                const x = 96 + i * ((554 - 96) / Math.max(1, monthlyTrend.length - 1));
                const clamped = Math.max(0, d.net);
                const y = 180 - (clamped / maxTrendValue) * 136;
                const isSelected = d.monthKey === trendPreviewMonth;
                return (
                  <g
                    key={d.monthKey}
                    className="cursor-pointer"
                    onClick={() => setTrendPreviewMonth(d.monthKey)}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? '6' : '4.5'}
                      fill={d.net >= 0 ? '#0F766E' : '#DC2626'}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                    <text
                      x={x}
                      y={Math.max(18, y - 12)}
                      textAnchor="middle"
                      className="fill-slate-700 font-mono text-[11px] font-semibold"
                    >
                      {d.net >= 0
                        ? `+${Math.round(d.net / 1000)}k`
                        : `${Math.round(d.net / 1000)}k`}
                    </text>
                    <text
                      x={x}
                      y="206"
                      textAnchor="middle"
                      className={`text-[12px] ${
                        isSelected ? 'fill-slate-900 font-semibold' : 'fill-slate-500'
                      }`}
                    >
                      {d.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {monthlyTrend.map((d) => {
              const isSelected = d.monthKey === trendPreviewMonth;
              return (
                <button
                  key={d.monthKey}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setTrendPreviewMonth(d.monthKey)}
                  className={`flex min-h-[44px] flex-col items-center justify-center rounded-lg border px-1.5 py-1 text-center transition-all active:scale-95 ${
                    isSelected
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-[11px] font-semibold whitespace-nowrap">
                    {d.label}
                  </span>
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      d.net >= 0 ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {d.net >= 0 ? '+' : ''}
                    {Math.round(d.net / 1000)}k
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Bottom Row: Payment Accounts & Receipt Methods Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900">
            支払元・口座別の実支出額
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            ポイント充当を差し引いた口座・カード別の実際の請求額
          </p>
          {analyticsSummary.accountBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">データなし</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {analyticsSummary.accountBreakdown.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <span className="min-w-0 font-medium text-slate-800 break-words">
                    {item.name}
                  </span>
                  <span className="shrink-0 font-mono font-semibold text-slate-900 tabular-nums">
                    {formatJPY(item.value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900">
            受取形態別の収入内訳
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            銀行振込・Amazonギフト券・現金など受取方法ごとの集計
          </p>
          {analyticsSummary.receiptBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">データなし</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {analyticsSummary.receiptBreakdown.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <span className="min-w-0 font-medium text-slate-800 break-words">
                    {item.name}
                  </span>
                  <span className="shrink-0 font-mono font-semibold text-emerald-700 tabular-nums">
                    {formatJPY(item.value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

