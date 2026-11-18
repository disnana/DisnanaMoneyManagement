import React, { useMemo, useState } from 'react';
import { Download, Plus, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { Account, Transaction, TransactionScope, TransactionType } from '../../types/finance';
import { ALL_CATEGORIES, getCategoryById } from '../../data/categories';
import { exportTransactionsToCSV, formatJPY } from '../../utils/format';
import { MonthSwitcherBar } from '../MonthSwitcherBar';
import { ResponsiveSheet } from '../ResponsiveSheet';
import { haptic } from '../../utils/haptics';
import { InsetGroup, Segmented, SwipeRow, TxRowBody, getDayHeading } from './MobileKit';

export type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

interface MobileLedgerProps {
  filtered: Transaction[];
  accounts: Account[];
  accountNameMap: Record<string, string>;
  summary: { income: number; expense: number };
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  typeFilter: 'all' | TransactionType;
  setTypeFilter: (v: 'all' | TransactionType) => void;
  scopeFilter: 'all' | TransactionScope;
  setScopeFilter: (v: 'all' | TransactionScope) => void;
  monthFilter: string;
  setMonthFilter: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  accountFilter: string;
  setAccountFilter: (v: string) => void;
  sortBy: SortKey;
  setSortBy: (v: SortKey) => void;
  hasActiveFilters: boolean;
  onReset: () => void;
  onEdit: (tx: Transaction) => void;
  onAskDelete: (tx: Transaction) => void;
  onAdd: () => void;
}

const TYPE_TABS = [
  { id: 'all', label: 'すべて' },
  { id: 'expense', label: '支出' },
  { id: 'income', label: '収入' },
  { id: 'transfer', label: '振替' },
] as const;

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'date_desc', label: '新しい順' },
  { id: 'date_asc', label: '古い順' },
  { id: 'amount_desc', label: '金額が大きい順' },
  { id: 'amount_asc', label: '金額が小さい順' },
];

const DayHeader: React.FC<{
  groupKey: string;
  heading: string;
  income: number;
  expense: number;
}> = ({ groupKey, heading, income, expense }) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(groupKey);
  if (!m) {
    return <div className="bg-slate-100 px-4 py-2 text-xs font-bold text-slate-500">{heading}</div>;
  }
  const dow = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
  const label = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'][dow];
  const chip =
    dow === 0 ? 'bg-red-500 text-white' : dow === 6 ? 'bg-sky-500 text-white' : 'bg-slate-400 text-white';
  const net = income - expense;
  return (
    <div className="flex items-center gap-2.5 bg-slate-100 px-4 py-2">
      <span className="font-mono text-2xl font-medium leading-none text-slate-800 tabular-nums">
        {Number(m[3])}
      </span>
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${chip}`}>{label}</span>
      <span
        className={`ml-auto font-mono text-sm font-bold tabular-nums ${
          net > 0 ? 'text-emerald-700' : 'text-slate-700'
        }`}
      >
        {net > 0 ? '+' : net < 0 ? '-' : ''}
        {formatJPY(Math.abs(net))}
      </span>
    </div>
  );
};

export const MobileLedger: React.FC<MobileLedgerProps> = (p) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const activeFilterCount =
    (p.scopeFilter !== 'all' ? 1 : 0) +
    (p.categoryFilter !== 'all' ? 1 : 0) +
    (p.accountFilter !== 'all' ? 1 : 0) +
    (p.sortBy !== 'date_desc' ? 1 : 0);

  const groups = useMemo(() => {
    if (p.sortBy !== 'date_desc' && p.sortBy !== 'date_asc') {
      return [{ key: 'flat', heading: '金額順', items: p.filtered, income: 0, expense: 0 }];
    }
    const map = new Map<string, Transaction[]>();
    for (const tx of p.filtered) {
      const arr = map.get(tx.date) ?? [];
      arr.push(tx);
      map.set(tx.date, arr);
    }
    return Array.from(map.entries()).map(([date, items]) => ({
      key: date,
      heading: getDayHeading(date),
      items,
      income: items.reduce((s, t) => s + (t.type === 'income' ? t.amount : 0), 0),
      expense: items.reduce((s, t) => s + (t.type === 'expense' ? t.amount : 0), 0),
    }));
  }, [p.filtered, p.sortBy]);

  return (
    <div className="space-y-4">
      {/* Sticky search + type segmented control */}
      <div className="glass-bar sticky top-0 z-20 -mx-4 space-y-2 border-b border-slate-200/70 px-4 pt-2.5 pb-2.5 -mt-5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              enterKeyHint="search"
              value={p.searchQuery}
              onChange={(e) => p.setSearchQuery(e.target.value)}
              placeholder="検索"
              className="h-10 w-full rounded-[10px] bg-slate-200/70 pl-9 pr-9 text-slate-900 placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/40 [&::-webkit-search-cancel-button]:hidden"
            />
            {p.searchQuery && (
              <button
                type="button"
                aria-label="検索をクリア"
                onClick={() => p.setSearchQuery('')}
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label="絞り込み・並び替え"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-slate-200/70 text-slate-700 transition-transform active:scale-90"
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-teal-700 px-1 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
        <Segmented
          layoutId="ledger-type-seg"
          value={p.typeFilter}
          options={TYPE_TABS}
          onChange={p.setTypeFilter}
        />
      </div>

      <MonthSwitcherBar
        selectedMonth={p.monthFilter}
        onChangeMonth={p.setMonthFilter}
        allowAll={true}
        className="w-full"
      />

      {/* Summary */}
      <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-2xl bg-white py-3 text-center ring-1 ring-slate-200/70">
        <div>
          <div className="text-[11px] font-medium text-slate-500">収入</div>
          <div className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
            {formatJPY(p.summary.income)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-500">支出</div>
          <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
            {formatJPY(p.summary.expense)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-500">件数</div>
          <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
            {p.filtered.length}
          </div>
        </div>
      </div>

      {p.filtered.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-[15px] font-semibold text-slate-700">取引が見つかりません</p>
          <p className="mt-1 text-xs text-slate-500">条件を変えるか、新しく記録してください。</p>
          <div className="mt-5 flex justify-center gap-2">
            {p.hasActiveFilters && (
              <button
                type="button"
                onClick={p.onReset}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-white px-4 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 active:scale-95"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                条件をリセット
              </button>
            )}
            <button
              type="button"
              onClick={p.onAdd}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white active:scale-95"
            >
              <Plus className="h-4 w-4" />
              記録する
            </button>
          </div>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <InsetGroup className="divide-y divide-slate-100">
              <DayHeader groupKey={g.key} heading={g.heading} income={g.income} expense={g.expense} />
              {g.items.map((tx) => {
                const cat = getCategoryById(tx.categoryId);
                const acc = p.accountNameMap[tx.accountId] ?? '不明な口座';
                const to = tx.toAccountId ? p.accountNameMap[tx.toAccountId] ?? '不明な口座' : '';
                return (
                  <SwipeRow
                    key={tx.id}
                    open={openRowId === tx.id}
                    onOpenChange={(o) => setOpenRowId(o ? tx.id : openRowId === tx.id ? null : openRowId)}
                    onTap={() => p.onEdit(tx)}
                    onEdit={() => p.onEdit(tx)}
                    onDelete={() => p.onAskDelete(tx)}
                  >
                    <TxRowBody
                      tx={tx}
                      category={cat}
                      accountLabel={tx.type === 'transfer' ? `${acc} → ${to}` : `${cat.name} · ${acc}`}
                      subLine={tx.counterparty || tx.memo || undefined}
                    />
                  </SwipeRow>
                );
              })}
            </InsetGroup>
          </section>
        ))
      )}

      {p.filtered.length > 0 && (
        <p className="pb-2 text-center text-[11px] text-slate-400">
          行を左にスワイプで編集・削除
        </p>
      )}

      <ResponsiveSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="絞り込み・並び替え"
        titleId="ledger-filter-title"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                p.onReset();
                setFilterOpen(false);
              }}
              className="min-h-[48px] rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 active:bg-slate-50"
            >
              リセット
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="min-h-[48px] rounded-xl bg-teal-700 text-sm font-semibold text-white active:bg-teal-800"
            >
              {p.filtered.length}件を表示
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">区分</div>
            <Segmented
              layoutId="ledger-scope-seg"
              value={p.scopeFilter}
              options={[
                { id: 'all', label: '個人・事業' },
                { id: 'personal', label: '個人' },
                { id: 'business', label: '事業・経費' },
              ] as const}
              onChange={p.setScopeFilter}
            />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">カテゴリ</span>
            <select
              value={p.categoryFilter}
              onChange={(e) => p.setCategoryFilter(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900"
            >
              <option value="all">すべてのカテゴリ</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">口座</span>
            <select
              value={p.accountFilter}
              onChange={(e) => p.setAccountFilter(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900"
            >
              <option value="all">すべての口座</option>
              {p.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">並び順</div>
            <div className="grid grid-cols-2 gap-2">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => p.setSortBy(s.id)}
                  className={`min-h-[44px] rounded-xl border px-3 text-[13px] font-semibold transition-colors ${
                    p.sortBy === s.id
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 text-slate-600 active:bg-slate-50'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={p.filtered.length === 0}
            onClick={() =>
              exportTransactionsToCSV(
                p.filtered,
                p.accountNameMap,
                `dmm-${p.monthFilter === 'all' ? 'all' : p.monthFilter}.csv`
              )
            }
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            表示中をCSV出力
          </button>
        </div>
      </ResponsiveSheet>
    </div>
  );
};
