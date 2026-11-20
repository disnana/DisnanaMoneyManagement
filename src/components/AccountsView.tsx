import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Landmark,
  Wallet,
  CreditCard,
  Smartphone,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Banknote,
  Globe,
  Repeat,
} from 'lucide-react';
import {
  Account,
  AccountType,
  AccountUsageScope,
  CurrencyCode,
  Transaction,
} from '../types/finance';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_USAGE_LABELS,
  CURRENCY_META,
} from '../data/categories';
import {
  formatDayLabel,
  formatForeignCurrency,
  formatFullDate,
  formatJPY,
  formatMonthLabel,
  getCurrentMonthKey,
  getEffectiveOutflow,
} from '../utils/format';
import { computeCreditCardSummary, getCycleRangeLabel } from '../utils/creditCard';
import { ConfirmDialog } from './ConfirmDialog';
import { usePendingSave } from '../hooks/usePendingSave';
import { ResponsiveSheet } from './ResponsiveSheet';
import { TransactionModalPrefill } from './TransactionModal';
import { InsetGroup, Segmented, SectionHeader, TxRowBody } from './mobile/MobileKit';
import { getCategoryById } from '../data/categories';
import { formatShortDate } from '../utils/format';
import { ChevronRight as RowChevron, Pencil as EditIcon, Plus as PlusIcon } from 'lucide-react';
import { useIsDesktop } from '../hooks/useMediaQuery';

interface AccountsViewProps {
  accounts: Account[];
  transactions: Transaction[];
  accountBalances: Record<string, number>;
  totalAssets: number;
  selectedMonth: string;
  onAddAccount: (acc: Omit<Account, 'id'>) => Promise<boolean>;
  onUpdateAccount: (id: string, patch: Partial<Omit<Account, 'id'>>) => Promise<boolean>;
  onDeleteAccount: (id: string) => Promise<boolean>;
  onOpenPrefilledTransaction: (prefill: TransactionModalPrefill) => void;
}

const ACCOUNT_ICONS: Record<AccountType, React.ComponentType<{ className?: string }>> = {
  bank: Landmark,
  psp: Repeat,
  foreign_bank: Globe,
  credit: CreditCard,
  debit: Banknote,
  cash: Wallet,
  emoney: Smartphone,
  investment: TrendingUp,
};

const ALL_ACCOUNT_TYPES: AccountType[] = [
  'bank',
  'psp',
  'foreign_bank',
  'credit',
  'debit',
  'cash',
  'emoney',
  'investment',
];

const CURRENCY_OPTIONS: CurrencyCode[] = ['JPY', 'USD', 'EUR', 'GBP', 'AUD'];

const USAGE_SCOPES: AccountUsageScope[] = ['personal', 'household', 'business'];

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  transactions,
  accountBalances,
  totalAssets,
  selectedMonth,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onOpenPrefilledTransaction,
}) => {
  const [usageFilter, setUsageFilter] = useState<'all' | AccountUsageScope>('all');
  const isDesktop = useIsDesktop();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [usageScope, setUsageScope] = useState<AccountUsageScope>('personal');
  const [initialBalance, setInitialBalance] = useState('0');
  const [currency, setCurrency] = useState<CurrencyCode>('JPY');
  const [fxRateToJpy, setFxRateToJpy] = useState('152');
  const [institution, setInstitution] = useState('');
  const [note, setNote] = useState('');

  // Card settings
  const [closingDay, setClosingDay] = useState('15');
  const [paymentDay, setPaymentDay] = useState('10');
  const [paymentMonthOffset, setPaymentMonthOffset] = useState<1 | 2>(1);
  const [creditLimit, setCreditLimit] = useState('500000');
  const [linkedBankAccountId, setLinkedBankAccountId] = useState('');

  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Strictly real bank accounts ONLY for withdrawal / settlement candidates
  const bankOnlyAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'bank'),
    [accounts]
  );

  const filteredAccounts = useMemo(() => {
    if (usageFilter === 'all') return accounts;
    return accounts.filter((a) => (a.usageScope ?? 'personal') === usageFilter);
  }, [accounts, usageFilter]);

  const creditCards = useMemo(
    () => filteredAccounts.filter((a) => a.type === 'credit'),
    [filteredAccounts]
  );

  const debitCards = useMemo(
    () => filteredAccounts.filter((a) => a.type === 'debit'),
    [filteredAccounts]
  );

  const nonCardAccounts = useMemo(
    () => filteredAccounts.filter((a) => a.type !== 'credit' && a.type !== 'debit'),
    [filteredAccounts]
  );

  const cardReferenceMonth = selectedMonth || getCurrentMonthKey();

  const cardSummaries = useMemo(() => {
    return creditCards.map((card) =>
      computeCreditCardSummary(
        card,
        transactions,
        accountBalances[card.id] ?? 0,
        cardReferenceMonth
      )
    );
  }, [creditCards, transactions, accountBalances, cardReferenceMonth]);

  const debitMonthlyStats = useMemo(() => {
    const map: Record<string, { monthTotal: number; count: number; recent: Transaction[] }> = {};
    for (const card of debitCards) {
      map[card.id] = { monthTotal: 0, count: 0, recent: [] };
    }
    for (const tx of transactions) {
      if (tx.type === 'expense' && map[tx.accountId]) {
        if (tx.date.slice(0, 7) === cardReferenceMonth) {
          map[tx.accountId].monthTotal += getEffectiveOutflow(tx);
          map[tx.accountId].count += 1;
        }
        map[tx.accountId].recent.push(tx);
      }
    }
    return map;
  }, [debitCards, transactions, cardReferenceMonth]);

  const groupedTotals = useMemo(() => {
    let liquid = 0;
    let investment = 0;
    let creditDebt = 0;
    for (const acc of filteredAccounts) {
      if (acc.type === 'debit') continue; // Balance resides in linked bank account
      const bal = accountBalances[acc.id] ?? 0;
      if (acc.type === 'investment') investment += bal;
      else if (acc.type === 'credit') creditDebt += bal;
      else liquid += bal;
    }
    return { liquid, investment, creditDebt };
  }, [filteredAccounts, accountBalances]);

  const openAdd = (presetType: AccountType = 'bank') => {
    setEditingAccount(null);
    setName('');
    setType(presetType);
    setUsageScope(presetType === 'psp' || presetType === 'foreign_bank' ? 'business' : 'personal');
    setInitialBalance('0');
    setCurrency(presetType === 'foreign_bank' ? 'USD' : 'JPY');
    setFxRateToJpy('152');
    setInstitution('');
    setNote('');
    setClosingDay('15');
    setPaymentDay('10');
    setPaymentMonthOffset(1);
    setCreditLimit(presetType === 'debit' ? '300000' : '500000');
    setLinkedBankAccountId(bankOnlyAccounts[0]?.id ?? '');
    setModalOpen(true);
  };

  const openEdit = (acc: Account) => {
    setEditingAccount(acc);
    setName(acc.name);
    setType(acc.type);
    setUsageScope(acc.usageScope ?? 'personal');
    setInitialBalance(String(acc.initialBalance));
    setCurrency(acc.currency ?? 'JPY');
    setFxRateToJpy(String(acc.fxRateToJpy ?? CURRENCY_META[acc.currency ?? 'USD'].defaultRate));
    setInstitution(acc.institution ?? '');
    setNote(acc.note ?? '');
    setClosingDay(String(acc.closingDay ?? 31));
    setPaymentDay(String(acc.paymentDay ?? 27));
    setPaymentMonthOffset(acc.paymentMonthOffset ?? 1);
    setCreditLimit(String(acc.creditLimit ?? (acc.type === 'debit' ? 300000 : 500000)));
    const validLinkedBank = bankOnlyAccounts.some((b) => b.id === acc.linkedBankAccountId)
      ? acc.linkedBankAccountId ?? ''
      : bankOnlyAccounts[0]?.id ?? '';
    setLinkedBankAccountId(validLinkedBank);
    setModalOpen(true);
  };

  const { pending, submit } = usePendingSave(modalOpen ? editingAccount?.id ?? 'new' : null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const initVal = Number(initialBalance) || 0;
    const isFxCapable = type === 'psp' || type === 'foreign_bank';
    const effectiveCurrency: CurrencyCode = isFxCapable ? currency : 'JPY';
    const payload: Omit<Account, 'id'> = {
      name: name.trim(),
      type,
      usageScope,
      initialBalance: type === 'debit' ? 0 : Math.round(initVal),
      currency: isFxCapable ? effectiveCurrency : undefined,
      fxRateToJpy:
        isFxCapable && effectiveCurrency !== 'JPY'
          ? Math.max(0.1, Number(fxRateToJpy) || CURRENCY_META[effectiveCurrency].defaultRate)
          : undefined,
      institution: institution.trim() || undefined,
      note: note.trim() || undefined,
      ...(type === 'credit'
        ? {
            closingDay: Number(closingDay) || 31,
            paymentDay: Number(paymentDay) || 27,
            paymentMonthOffset,
            creditLimit: Math.max(0, Number(creditLimit) || 0),
            linkedBankAccountId: linkedBankAccountId || undefined,
          }
        : type === 'debit'
        ? {
            creditLimit: Math.max(0, Number(creditLimit) || 0),
            linkedBankAccountId: linkedBankAccountId || undefined,
          }
        : {}),
    };

    const saved = await submit(() => editingAccount ? onUpdateAccount(editingAccount.id, payload) : onAddAccount(payload));
    if (saved) setModalOpen(false);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {isDesktop ? (
        <>
      {/* Header & Actions */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="hidden lg:block">
          <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            口座・カード管理
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
            個人用・家庭用・業務用の区分ごとに、銀行口座・クレジットカード・デビットカードを整理できます
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
          <button
            type="button"
            onClick={() => onOpenPrefilledTransaction({ mode: 'fx_payout' })}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3.5 text-xs font-semibold text-teal-900 transition-all hover:bg-teal-100 active:scale-[0.98] whitespace-nowrap"
          >
            <Globe className="h-4 w-4 shrink-0" />
            <span>外貨・Stripe入金</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenPrefilledTransaction({ type: 'transfer' })}
            disabled={accounts.length < 2}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
          >
            <ArrowRightLeft className="h-4 w-4 shrink-0" />
            <span>口座間で振替</span>
          </button>
          <button
            type="button"
            onClick={() => openAdd('credit')}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap"
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            <span>カードを追加</span>
          </button>
          <button
            type="button"
            onClick={() => openAdd('bank')}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white transition-all hover:bg-teal-800 active:scale-[0.98] whitespace-nowrap"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>口座を追加</span>
          </button>
        </div>
      </div>

      {/* Scope Filter Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:inline-flex">
          {(
            [
              { id: 'all', label: 'すべての用途' },
              { id: 'personal', label: '個人用' },
              { id: 'household', label: '家庭用' },
              { id: 'business', label: '業務用' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setUsageFilter(tab.id)}
              className={`min-h-[42px] rounded-lg px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                usageFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-500 tabular-nums">
          表示中: {filteredAccounts.length}件（カード {creditCards.length + debitCards.length}枚 · 口座 {nonCardAccounts.length}件）
        </span>
      </div>

      {/* Asset Distribution Strip */}
      <section className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">
            {usageFilter === 'all' ? '正味総資産（全区分）' : `${ACCOUNT_USAGE_LABELS[usageFilter]} 合計`}
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatJPY(
              usageFilter === 'all'
                ? totalAssets
                : groupedTotals.liquid + groupedTotals.investment + groupedTotals.creditDebt
            )}
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">預金・現金・電子マネー</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatJPY(groupedTotals.liquid)}
          </div>
        </div>
        <div className="p-5 sm:border-t sm:border-slate-200 lg:border-t-0">
          <div className="text-xs font-medium text-slate-500">投資・積立口座</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-teal-800 tabular-nums">
            {formatJPY(groupedTotals.investment)}
          </div>
        </div>
        <div className="p-5 sm:border-t sm:border-slate-200 lg:border-t-0">
          <div className="text-xs font-medium text-slate-500">クレカ未決済残高</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
              groupedTotals.creditDebt < 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {formatJPY(groupedTotals.creditDebt)}
          </div>
        </div>
      </section>

        </>
      ) : (
        <>
      {/* Mobile: one filter row + one add menu, compact summary */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Segmented
            layoutId="accounts-usage-seg"
            value={usageFilter}
            options={[
              { id: 'all', label: 'すべて' },
              { id: 'personal', label: '個人' },
              { id: 'household', label: '家庭' },
              { id: 'business', label: '業務' },
            ] as const}
            onChange={setUsageFilter}
          />
        </div>
        <button
          type="button"
          aria-label="追加"
          onClick={() => setAddMenuOpen(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white transition-transform active:scale-90"
        >
          <Plus className="h-5 w-5" strokeWidth={2.4} />
        </button>
      </div>

      <section
        aria-label="資産サマリー"
        className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70"
      >
        <div className="px-5 pb-3 pt-4">
          <div className="text-xs font-medium text-slate-500">
            {usageFilter === 'all' ? '正味総資産' : `${ACCOUNT_USAGE_LABELS[usageFilter]} 合計`}
          </div>
          <div className="mt-0.5 font-mono text-[32px] font-bold leading-tight text-slate-900 tabular-nums">
            {formatJPY(
              usageFilter === 'all'
                ? totalAssets
                : groupedTotals.liquid + groupedTotals.investment + groupedTotals.creditDebt
            )}
          </div>
        </div>
        <dl className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
          <div className="flex items-center justify-between px-5 py-2.5">
            <dt className="text-slate-500">預金・現金</dt>
            <dd className="font-mono font-semibold tabular-nums">{formatJPY(groupedTotals.liquid)}</dd>
          </div>
          {groupedTotals.investment !== 0 && (
            <div className="flex items-center justify-between px-5 py-2.5">
              <dt className="text-slate-500">投資・積立</dt>
              <dd className="font-mono font-semibold tabular-nums">{formatJPY(groupedTotals.investment)}</dd>
            </div>
          )}
          {groupedTotals.creditDebt !== 0 && (
            <div className="flex items-center justify-between px-5 py-2.5">
              <dt className="text-slate-500">クレカ未決済</dt>
              <dd
                className={`font-mono font-semibold tabular-nums ${
                  groupedTotals.creditDebt < 0 ? 'text-red-600' : ''
                }`}
              >
                {formatJPY(groupedTotals.creditDebt)}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <ResponsiveSheet
        open={addMenuOpen}
        instantClose
        onClose={() => setAddMenuOpen(false)}
        title="追加"
        titleId="accounts-add-menu"
      >
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200/70">
          {[
            { label: '口座を追加', run: () => openAdd('bank') },
            { label: 'カードを追加', run: () => openAdd('credit') },
            ...(accounts.length >= 2
              ? [{ label: '口座間で振替', run: () => onOpenPrefilledTransaction({ type: 'transfer' }) }]
              : []),
            { label: '外貨・Stripe入金', run: () => onOpenPrefilledTransaction({ mode: 'fx_payout' }) },
          ].map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                setAddMenuOpen(false);
                it.run();
              }}
              className="flex min-h-[52px] w-full items-center px-4 text-left text-[16px] text-slate-900 active:bg-slate-50"
            >
              {it.label}
            </button>
          ))}
        </div>
      </ResponsiveSheet>

        </>
      )}

      {isDesktop && (
        <>
      {/* Credit & Debit Cards Section */}
      {(creditCards.length > 0 || debitCards.length > 0) && (
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900">
              <span className="lg:hidden">カード</span>
              <span className="hidden lg:inline">登録カード（クレジットカード・デビットカード）</span>
            </h3>
            <p className="mt-0.5 hidden text-xs text-slate-500 lg:block">
              基準月: {formatMonthLabel(cardReferenceMonth)} · クレカは締め日別の請求予定と利用枠、デビットは紐付け銀行口座からの即時引き落としを管理します
            </p>
          </div>

          <div className="space-y-4">
            {/* Credit Cards */}
            {cardSummaries.map((summary) => {
              const { card } = summary;
              const isExpanded = expandedCardId === card.id;
              const linkedBank = bankOnlyAccounts.find(
                (a) => a.id === card.linkedBankAccountId
              );
              const utilPct = Math.min(100, Math.round(summary.utilizationRatio * 100));
              const scopeLabel = ACCOUNT_USAGE_LABELS[card.usageScope ?? 'personal'];

              return (
                <article
                  key={card.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <h4 className="text-base font-semibold text-slate-900 break-words">
                            {card.name}
                          </h4>
                          <span className="text-xs font-medium text-teal-800">
                            · クレジットカード · {scopeLabel}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          {card.institution && (
                            <>
                              <span>{card.institution}</span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span>毎月 {formatDayLabel(card.closingDay)}締め</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {card.paymentMonthOffset === 2 ? '翌々月' : '翌月'}{' '}
                            {formatDayLabel(card.paymentDay)}払い
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            引落銀行:{' '}
                            {linkedBank ? linkedBank.name : '未設定（編集で選択）'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPrefilledTransaction({
                            type: 'expense',
                            accountId: card.id,
                            scope: card.usageScope === 'business' ? 'business' : 'personal',
                          })
                        }
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] sm:flex-initial whitespace-nowrap"
                      >
                        + 決済を記録
                      </button>
                      {summary.thisMonthRemaining > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenPrefilledTransaction({
                              type: 'transfer',
                              accountId: linkedBank?.id ?? bankOnlyAccounts[0]?.id,
                              toAccountId: card.id,
                              amount: summary.thisMonthRemaining,
                              title: `${card.name} ${formatMonthLabel(
                                summary.currentMonthKey
                              )}分引き落とし`,
                              isPrepayment: false,
                              targetBillingMonth: summary.currentMonthKey,
                            })
                          }
                          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white transition-all hover:bg-teal-800 active:scale-[0.98] sm:flex-initial whitespace-nowrap"
                        >
                          今月分を引き落とし記帳
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPrefilledTransaction({
                            type: 'transfer',
                            accountId: linkedBank?.id ?? bankOnlyAccounts[0]?.id,
                            toAccountId: card.id,
                            amount:
                              summary.nextMonthRemaining > 0
                                ? summary.nextMonthRemaining
                                : 10000,
                            title: `${card.name} 先払い（繰上返済）`,
                            isPrepayment: true,
                            targetBillingMonth: summary.nextMonthKey,
                          })
                        }
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] sm:flex-initial whitespace-nowrap"
                      >
                        先払い・繰上返済
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(card)}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 active:scale-95"
                        aria-label={`${card.name}の設定を編集`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {accounts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDeletingAccount(card)}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95"
                          aria-label={`${card.name}を削除`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 4-Column Billing & Limit Strip */}
                  <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
                    <div className="p-5">
                      <div className="text-xs font-medium text-slate-500">
                        今月 ({Number(summary.currentMonthKey.slice(5, 7))}月
                        {formatDayLabel(card.paymentDay)}) 支払予定
                      </div>
                      <div className="mt-1.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
                        {formatJPY(summary.thisMonthRemaining)}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                        {getCycleRangeLabel(
                          summary.currentMonthKey,
                          card.closingDay,
                          card.paymentMonthOffset
                        )}
                        {summary.thisMonthSettled > 0 && (
                          <span className="ml-1 text-emerald-700">
                            （決済済 {formatJPY(summary.thisMonthSettled)}）
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="text-xs font-medium text-slate-500">
                        来月 ({Number(summary.nextMonthKey.slice(5, 7))}月
                        {formatDayLabel(card.paymentDay)}) 支払予定
                      </div>
                      <div className="mt-1.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
                        {formatJPY(summary.nextMonthRemaining)}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                        {getCycleRangeLabel(
                          summary.nextMonthKey,
                          card.closingDay,
                          card.paymentMonthOffset
                        )}
                        {summary.nextMonthPrepaid > 0 && (
                          <span className="ml-1 font-medium text-teal-700">
                            （先払い済 {formatJPY(summary.nextMonthPrepaid)}）
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-5 sm:border-t sm:border-slate-100 lg:border-t-0">
                      <div className="text-xs font-medium text-slate-500">
                        未払い利用残高 / 先払い累計
                      </div>
                      <div className="mt-1.5 font-mono text-xl font-bold text-red-600 tabular-nums">
                        {formatJPY(summary.totalUnpaidBalance)}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                        先払い・繰上返済累計 {formatJPY(summary.totalPrepaidCredit)}
                      </div>
                    </div>

                    <div className="p-5 sm:border-t sm:border-slate-100 lg:border-t-0">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                        <span>残り利用可能枠</span>
                        <span className="font-mono tabular-nums">{utilPct}% 使用中</span>
                      </div>
                      <div className="mt-1.5 font-mono text-xl font-bold text-teal-800 tabular-nums">
                        {summary.creditLimit > 0
                          ? formatJPY(summary.availableCredit)
                          : '未設定'}
                      </div>
                      {summary.creditLimit > 0 && (
                        <>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${
                                utilPct >= 85
                                  ? 'bg-red-600'
                                  : utilPct >= 60
                                  ? 'bg-amber-500'
                                  : 'bg-teal-700'
                              }`}
                              style={{ width: `${utilPct}%` }}
                            />
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                            限度額 {formatJPY(summary.creditLimit)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expandable Statement Details */}
                  <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-1 sm:px-6">
                    <button
                      type="button"
                      onClick={() => setExpandedCardId(isExpanded ? null : card.id)}
                      className="flex min-h-[48px] w-full items-center justify-between gap-2 text-left text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900"
                    >
                      <span>
                        今月・来月の利用明細内訳を表示（今月{' '}
                        {summary.thisMonthTransactions.length}件 / 来月{' '}
                        {summary.nextMonthTransactions.length}件）
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      )}
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          key="statement-details"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                          className="mt-3 grid grid-cols-1 gap-4 pb-2 lg:grid-cols-2"
                        >
                          <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs font-semibold text-slate-800">
                              <span>
                                {formatMonthLabel(summary.currentMonthKey)} 請求対象
                              </span>
                              <span className="font-mono tabular-nums">
                                {formatJPY(summary.thisMonthGross)}
                              </span>
                            </div>
                            {summary.thisMonthTransactions.length === 0 ? (
                              <div className="py-4 text-center text-xs text-slate-400">
                                対象利用なし
                              </div>
                            ) : (
                              <div className="mt-2 divide-y divide-slate-100">
                                {summary.thisMonthTransactions.map((tx) => (
                                  <div
                                    key={tx.id}
                                    className="flex items-start justify-between gap-3 py-2 text-xs"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium leading-snug text-slate-800 break-words">
                                        {tx.title}
                                      </div>
                                      <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                                        {formatFullDate(tx.date)}
                                        {(tx.pointUsed ?? 0) > 0 &&
                                          ` · P充当 ${formatJPY(tx.pointUsed ?? 0)}`}
                                      </div>
                                    </div>
                                    <span className="shrink-0 font-mono font-semibold text-slate-900 tabular-nums">
                                      {formatJPY(getEffectiveOutflow(tx))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs font-semibold text-slate-800">
                              <span>
                                {formatMonthLabel(summary.nextMonthKey)} 請求対象
                              </span>
                              <span className="font-mono tabular-nums">
                                {formatJPY(summary.nextMonthGross)}
                              </span>
                            </div>
                            {summary.nextMonthTransactions.length === 0 ? (
                              <div className="py-4 text-center text-xs text-slate-400">
                                対象利用なし
                              </div>
                            ) : (
                              <div className="mt-2 divide-y divide-slate-100">
                                {summary.nextMonthTransactions.map((tx) => (
                                  <div
                                    key={tx.id}
                                    className="flex items-start justify-between gap-3 py-2 text-xs"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium leading-snug text-slate-800 break-words">
                                        {tx.title}
                                      </div>
                                      <div className="text-[11px] text-slate-400 tabular-nums">
                                        {formatFullDate(tx.date)}
                                        {(tx.pointUsed ?? 0) > 0 &&
                                          ` · P充当 ${formatJPY(tx.pointUsed ?? 0)}`}
                                      </div>
                                    </div>
                                    <span className="shrink-0 font-mono font-semibold text-slate-900 tabular-nums">
                                      {formatJPY(getEffectiveOutflow(tx))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </article>
              );
            })}

            {/* Debit Cards */}
            {debitCards.map((card) => {
              const linkedBank = bankOnlyAccounts.find(
                (b) => b.id === card.linkedBankAccountId
              );
              const bankBal = linkedBank
                ? accountBalances[linkedBank.id] ?? 0
                : accountBalances[card.id] ?? 0;
              const stats = debitMonthlyStats[card.id] ?? {
                monthTotal: 0,
                count: 0,
                recent: [],
              };
              const scopeLabel = ACCOUNT_USAGE_LABELS[card.usageScope ?? 'personal'];
              const cap = card.creditLimit ?? 0;
              const capPct = cap > 0 ? Math.min(100, Math.round((stats.monthTotal / cap) * 100)) : 0;

              return (
                <article
                  key={card.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                        <Banknote className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <h4 className="text-base font-semibold text-slate-900 break-words">
                            {card.name}
                          </h4>
                          <span className="text-xs font-medium text-sky-700">
                            · デビットカード（即時引落） · {scopeLabel}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          {card.institution && (
                            <>
                              <span>{card.institution}</span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span>
                            引落銀行口座:{' '}
                            {linkedBank ? linkedBank.name : '未連携（編集で銀行を選択）'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPrefilledTransaction({
                            type: 'expense',
                            accountId: card.id,
                            scope: card.usageScope === 'business' ? 'business' : 'personal',
                          })
                        }
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] sm:flex-initial whitespace-nowrap"
                      >
                        + デビット決済を記録
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(card)}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 active:scale-95"
                        aria-label={`${card.name}の設定を編集`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {accounts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDeletingAccount(card)}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95"
                          aria-label={`${card.name}を削除`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
                    <div className="p-5">
                      <div className="text-xs font-medium text-slate-500">
                        {formatMonthLabel(cardReferenceMonth)}の利用合計（即時決済）
                      </div>
                      <div className="mt-1.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
                        {formatJPY(stats.monthTotal)}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                        利用回数 {stats.count}回
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="text-xs font-medium text-slate-500">
                        連携銀行口座の現在残高（実質利用可能額）
                      </div>
                      <div className="mt-1.5 font-mono text-xl font-bold text-teal-800 tabular-nums">
                        {formatJPY(bankBal)}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {linkedBank ? linkedBank.name : '銀行口座と未連携'}
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                        <span>月間利用上限目安</span>
                        {cap > 0 && (
                          <span className="font-mono tabular-nums">{capPct}%</span>
                        )}
                      </div>
                      <div className="mt-1.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
                        {cap > 0 ? formatJPY(Math.max(0, cap - stats.monthTotal)) : '上限なし'}
                      </div>
                      {cap > 0 && (
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${
                              capPct >= 90 ? 'bg-red-600' : 'bg-sky-600'
                            }`}
                            style={{ width: `${capPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Non-Card Accounts Grid */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold tracking-tight text-slate-900">
          銀行口座・決済サービス・外貨・現金・投資口座
        </h3>

        {nonCardAccounts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
            選択中の用途区分に一致する口座はありません。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {nonCardAccounts.map((acc) => {
              const Icon = ACCOUNT_ICONS[acc.type] ?? Landmark;
              const balance = accountBalances[acc.id] ?? acc.initialBalance;
              const scopeLabel = ACCOUNT_USAGE_LABELS[acc.usageScope ?? 'personal'];
              const accCurrency = acc.currency ?? 'JPY';
              const accRate =
                acc.fxRateToJpy ?? CURRENCY_META[accCurrency]?.defaultRate ?? 1;
              const foreignApprox =
                accCurrency !== 'JPY' && accRate > 0 ? balance / accRate : null;

              return (
                <article
                  key={acc.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-base font-semibold leading-snug text-slate-900 break-words">
                            {acc.name}
                          </h4>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                            <span>{ACCOUNT_TYPE_LABELS[acc.type] ?? acc.type}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-teal-800">{scopeLabel}</span>
                            {accCurrency !== 'JPY' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono font-medium text-slate-700">
                                  {accCurrency}
                                </span>
                              </>
                            )}
                            {acc.institution && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="break-words">{acc.institution}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(acc)}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 active:scale-95"
                          aria-label={`${acc.name}を編集`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {accounts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDeletingAccount(acc)}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95"
                            aria-label={`${acc.name}を削除`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {acc.note && (
                      <p className="mt-3 text-xs leading-relaxed text-slate-500">
                        {acc.note}
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3.5">
                    {acc.type === 'psp' || acc.type === 'foreign_bank' ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPrefilledTransaction({
                            mode: 'fx_payout',
                            accountId: acc.id,
                          })
                        }
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3.5 text-xs font-semibold text-teal-800 transition-all hover:bg-teal-100 active:scale-[0.98] whitespace-nowrap"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        <span>一括入金記帳</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPrefilledTransaction({
                            type: 'expense',
                            accountId: acc.id,
                            scope: acc.usageScope === 'business' ? 'business' : 'personal',
                          })
                        }
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-xs font-semibold text-teal-700 transition-all hover:bg-slate-100 active:scale-[0.98] whitespace-nowrap"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>この口座で記録</span>
                      </button>
                    )}
                    <div className="text-right">
                      <span
                        className={`block font-mono text-xl font-bold tabular-nums ${
                          balance < 0 ? 'text-red-600' : 'text-slate-900'
                        }`}
                      >
                        {formatJPY(balance)}
                      </span>
                      {foreignApprox !== null && (
                        <span className="mt-0.5 block font-mono text-[11px] text-slate-500 tabular-nums">
                          ≈ {formatForeignCurrency(foreignApprox, accCurrency)} (@¥{accRate})
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

        </>
      )}

      {!isDesktop && (() => {
        const TYPE_TINT: Record<AccountType, string> = {
          bank: '#4F46E5',
          psp: '#7C3AED',
          foreign_bank: '#0284C7',
          credit: '#16A34A',
          debit: '#059669',
          cash: '#2563EB',
          emoney: '#DB2777',
          investment: '#D97706',
        };
        const renderRow = (acc: Account) => {
          const Icon = ACCOUNT_ICONS[acc.type];
          const tint = TYPE_TINT[acc.type];
          const bal = accountBalances[acc.id] ?? 0;
          const sub =
            acc.type === 'debit'
              ? '即時引き落とし'
              : acc.type === 'credit'
              ? `${formatDayLabel(acc.closingDay)}締め`
              : acc.institution || ACCOUNT_TYPE_LABELS[acc.type];
          return (
            <button
              key={acc.id}
              type="button"
              onClick={() => setDetailId(acc.id)}
              className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-slate-50"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${tint}1A`, color: tint }}
              >
                <Icon className="h-[19px] w-[19px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-slate-900">{acc.name}</span>
                <span className="block truncate text-xs text-slate-500">{sub}</span>
              </span>
              {acc.type !== 'debit' && (
                <span
                  className={`shrink-0 font-mono text-[15px] font-bold tabular-nums ${
                    bal < 0 ? 'text-red-600' : 'text-slate-900'
                  }`}
                >
                  {formatJPY(bal)}
                </span>
              )}
              <RowChevron className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
          );
        };
        const cardRows = [...creditCards, ...debitCards];
        const detail = detailId ? accounts.find((a) => a.id === detailId) ?? null : null;
        const detailTx = detail
          ? transactions
              .filter(
                (t) =>
                  (t.accountId === detail.id || t.toAccountId === detail.id) &&
                  t.date.slice(0, 7) === cardReferenceMonth
              )
              .sort((a, b) => b.date.localeCompare(a.date))
          : [];
        const detailBal = detail ? accountBalances[detail.id] ?? 0 : 0;
        const credit =
          detail && detail.type === 'credit'
            ? computeCreditCardSummary(detail, transactions, detailBal, cardReferenceMonth)
            : null;
        const monthIn = detailTx.reduce(
          (sum, t) => sum + (t.type === 'income' || (t.type === 'transfer' && t.toAccountId === detail?.id) ? t.amount : 0),
          0
        );
        const monthOut = detailTx.reduce(
          (sum, t) => sum + (t.type === 'expense' || (t.type === 'transfer' && t.accountId === detail?.id) ? getEffectiveOutflow(t) : 0),
          0
        );
        const DetailIcon = detail ? ACCOUNT_ICONS[detail.type] : Landmark;

        return (
          <div className="space-y-6">
            {nonCardAccounts.length > 0 && (
              <section>
                <SectionHeader title="口座" />
                <InsetGroup className="divide-y divide-slate-100">{nonCardAccounts.map(renderRow)}</InsetGroup>
              </section>
            )}
            {cardRows.length > 0 && (
              <section>
                <SectionHeader title="カード" />
                <InsetGroup className="divide-y divide-slate-100">{cardRows.map(renderRow)}</InsetGroup>
              </section>
            )}
            {filteredAccounts.length === 0 && (
              <p className="px-6 py-10 text-center text-sm text-slate-500">該当する口座がありません</p>
            )}

            <ResponsiveSheet
              open={Boolean(detail)}
              onClose={() => setDetailId(null)}
              title={detail?.name ?? ''}
              titleId="account-detail-title"
              fullScreenMobile
            >
              {detail && (
                <div className="space-y-6">
                  <div className="text-center">
                    <span
                      className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: `${TYPE_TINT[detail.type]}1A`,
                        color: TYPE_TINT[detail.type],
                      }}
                    >
                      <DetailIcon className="h-7 w-7" />
                    </span>
                    <div className="mt-2 text-xs text-slate-500">
                      {ACCOUNT_TYPE_LABELS[detail.type]} · {ACCOUNT_USAGE_LABELS[detail.usageScope ?? 'personal']}
                      {detail.institution ? ` · ${detail.institution}` : ''}
                    </div>
                    {detail.type !== 'debit' && (
                      <div
                        className={`mt-1 font-mono text-[34px] font-bold leading-tight tabular-nums ${
                          detailBal < 0 ? 'text-red-600' : 'text-slate-900'
                        }`}
                      >
                        {formatJPY(detailBal)}
                      </div>
                    )}
                    {credit && (
                      <div className="mt-2 flex justify-center gap-5 font-mono text-xs text-slate-500 tabular-nums">
                        <span>今月引落 {formatJPY(credit.thisMonthRemaining)}</span>
                        <span>来月 {formatJPY(credit.nextMonthRemaining)}</span>
                        {credit.creditLimit > 0 && <span>残り枠 {formatJPY(credit.availableCredit)}</span>}
                      </div>
                    )}
                  </div>

                  <section>
                    <SectionHeader title={`${formatMonthLabel(cardReferenceMonth)}の明細`} />
                    {detailTx.length === 0 ? (
                      <InsetGroup className="px-6 py-8 text-center text-sm text-slate-500">
                        記録はありません
                      </InsetGroup>
                    ) : (
                      <>
                        <div className="mb-2 flex justify-end gap-4 px-1 font-mono text-xs tabular-nums text-slate-500">
                          <span>入 <b className="text-emerald-700">{formatJPY(monthIn)}</b></span>
                          <span>出 <b className="text-slate-900">{formatJPY(monthOut)}</b></span>
                        </div>
                        <InsetGroup className="divide-y divide-slate-100">
                          {detailTx.map((tx) => {
                            const cat = getCategoryById(tx.categoryId);
                            return (
                              <TxRowBody
                                key={tx.id}
                                tx={tx}
                                category={cat}
                                accountLabel={`${formatShortDate(tx.date)} · ${cat.name}`}
                              />
                            );
                          })}
                        </InsetGroup>
                      </>
                    )}
                  </section>

                  <InsetGroup className="divide-y divide-slate-100">
                    <button
                      type="button"
                      onClick={() => onOpenPrefilledTransaction({ type: 'expense', accountId: detail.id })}
                      className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] text-teal-700 active:bg-slate-50"
                    >
                      <PlusIcon className="h-5 w-5" /> この{detail.type === 'credit' || detail.type === 'debit' ? 'カード' : '口座'}で記録
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(detail)}
                      className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] text-slate-900 active:bg-slate-50"
                    >
                      <EditIcon className="h-5 w-5 text-slate-500" /> 編集
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingAccount(detail)}
                      className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] text-red-600 active:bg-slate-50"
                    >
                      <Trash2 className="h-5 w-5" /> 削除
                    </button>
                  </InsetGroup>
                </div>
              )}
            </ResponsiveSheet>
          </div>
        );
      })()}

      {/* Add / Edit Account & Card Modal */}
      {/* Add / Edit Account & Card Sheet */}
      <ResponsiveSheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingAccount ? '口座・カード情報を編集' : '新しい口座・カードを追加'}
        maxWidthClass="sm:max-w-2xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto"
            >
              キャンセル
            </button>
            <button
              type="submit"
              form="account-form"
              disabled={pending}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-teal-700 px-6 text-sm font-semibold text-white transition-all hover:bg-teal-800 active:scale-[0.98] sm:w-auto"
            >
              保存する
            </button>
          </div>
        }
      >
        <form inert={pending} aria-busy={pending} id="account-form" onSubmit={handleSubmit} className="space-y-5">
          {/* Visual Type Picker */}
          <div>
            <label className="block text-xs font-medium text-slate-600">
              口座・カードの種別
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_ACCOUNT_TYPES.map((t) => {
                const TypeIcon = ACCOUNT_ICONS[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setType(t);
                      if ((t === 'credit' || t === 'debit') && !linkedBankAccountId) {
                        setLinkedBankAccountId(bankOnlyAccounts[0]?.id ?? '');
                      }
                    }}
                    className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold leading-tight transition-colors ${
                      active
                        ? 'border-teal-700 bg-teal-50 text-teal-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <TypeIcon
                      className={`h-4 w-4 shrink-0 ${
                        active ? 'text-teal-700' : 'text-slate-400'
                      }`}
                    />
                    <span>{ACCOUNT_TYPE_LABELS[t]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Usage Scope Picker */}
          <div>
            <label className="block text-xs font-medium text-slate-600">
              用途区分（誰の・何の目的の口座/カードか）
            </label>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {USAGE_SCOPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setUsageScope(s)}
                  className={`min-h-[42px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    usageScope === s
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {ACCOUNT_USAGE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="acc-name"
                className="block text-xs font-medium text-slate-600"
              >
                名称
              </label>
              <input
                id="acc-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  type === 'credit'
                    ? '例: 楽天カード（家庭用）'
                    : type === 'debit'
                    ? '例: 事業用Visaデビット'
                    : type === 'psp'
                    ? '例: Stripe決済アカウント'
                    : type === 'foreign_bank'
                    ? '例: 海外ドル受取口座'
                    : '例: 三菱UFJ銀行（普通）'
                }
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="acc-inst"
                className="block text-xs font-medium text-slate-600"
              >
                金融機関・サービス名（任意）
              </label>
              <input
                id="acc-inst"
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="例: Stripe、Wise、みずほ銀行"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Foreign Currency Settings for PSP / Foreign Bank */}
          {(type === 'psp' || type === 'foreign_bank') && (
            <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-900">
                <Globe className="h-4 w-4 text-teal-700" />
                <span>外貨・換算レート設定</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    主な取扱通貨
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => {
                      const nextCur = e.target.value as CurrencyCode;
                      setCurrency(nextCur);
                      setFxRateToJpy(String(CURRENCY_META[nextCur].defaultRate));
                    }}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900"
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {CURRENCY_META[c].label}
                      </option>
                    ))}
                  </select>
                </div>
                {currency !== 'JPY' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      参考円換算レート (1 {currency} = 円)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.1"
                      step="0.01"
                      value={fxRateToJpy}
                      onChange={(e) => setFxRateToJpy(e.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs font-semibold tabular-nums"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Initial Balance (hidden for debit cards since they link directly to bank) */}
          {type !== 'debit' && (
            <div>
              <label
                htmlFor="acc-init"
                className="block text-xs font-medium text-slate-600"
              >
                {type === 'credit'
                  ? '登録時点の未決済残高（通常 0、負債がある場合はマイナスまたは 0）'
                  : '開始時残高 (円換算額)'}
              </label>
              <input
                id="acc-init"
                type="number"
                inputMode="numeric"
                step="1"
                required
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm font-semibold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
              />
            </div>
          )}

          {/* Credit Card Specific Settings */}
          {type === 'credit' && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <CheckCircle2 className="h-4 w-4 text-teal-700" />
                <span>クレジットカード締切日・支払日・引落銀行</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    締切日
                  </label>
                  <select
                    value={closingDay}
                    onChange={(e) => setClosingDay(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900"
                  >
                    <option value="10">毎月10日</option>
                    <option value="15">毎月15日</option>
                    <option value="20">毎月20日</option>
                    <option value="25">毎月25日</option>
                    <option value="31">月末</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    支払月
                  </label>
                  <select
                    value={paymentMonthOffset}
                    onChange={(e) =>
                      setPaymentMonthOffset(Number(e.target.value) as 1 | 2)
                    }
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900"
                  >
                    <option value={1}>翌月払い</option>
                    <option value={2}>翌々月払い</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    支払日
                  </label>
                  <select
                    value={paymentDay}
                    onChange={(e) => setPaymentDay(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900"
                  >
                    {[4, 5, 10, 15, 26, 27, 28, 31].map((d) => (
                      <option key={d} value={d}>
                        {d === 31 ? '末日' : `${d}日`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    利用限度額 (円)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="10000"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs font-semibold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    引き落とし口座（銀行口座のみ）
                  </label>
                  {bankOnlyAccounts.length === 0 ? (
                    <p className="mt-1.5 text-[11px] text-amber-700">
                      銀行口座が未登録です。先に「銀行口座」を登録してください。
                    </p>
                  ) : (
                    <select
                      value={linkedBankAccountId}
                      onChange={(e) => setLinkedBankAccountId(e.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900"
                    >
                      <option value="">指定なし</option>
                      {bankOnlyAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}（{ACCOUNT_USAGE_LABELS[b.usageScope ?? 'personal']}）
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Debit Card Specific Settings */}
          {type === 'debit' && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <CheckCircle2 className="h-4 w-4 text-sky-700" />
                <span>デビットカード即時引き落とし設定</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                デビットカードで支払った金額は、下の引き落とし銀行口座の残高から即座に差し引かれます。
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    引き落とし銀行口座（銀行口座のみ）
                  </label>
                  {bankOnlyAccounts.length === 0 ? (
                    <p className="mt-1.5 text-[11px] text-amber-700">
                      銀行口座が未登録です。先に「銀行口座」を登録してください。
                    </p>
                  ) : (
                    <select
                      value={linkedBankAccountId}
                      onChange={(e) => setLinkedBankAccountId(e.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900"
                    >
                      <option value="">連携先を選択</option>
                      {bankOnlyAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}（{ACCOUNT_USAGE_LABELS[b.usageScope ?? 'personal']}）
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    月間利用上限目安 (円・任意)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="10000"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    placeholder="0 = 上限なし"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs font-semibold tabular-nums"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="acc-note" className="block text-xs font-medium text-slate-600">
              用途メモ（任意）
            </label>
            <input
              id="acc-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: 光熱費・食費引き落とし専用、経費専用"
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>
        </form>
      </ResponsiveSheet>

      <ConfirmDialog
        open={Boolean(deletingAccount)}
        title="この口座・カードを削除しますか？"
        description={
          deletingAccount
            ? `「${deletingAccount.name}」を削除します。既存の取引履歴は残りますが、一覧から除外されます。`
            : ''
        }
        confirmLabel="削除する"
        danger={true}
        onConfirm={() => onDeleteAccount(deletingAccount!.id)}
        onSaved={() => setDetailId(null)}
        onClose={() => setDeletingAccount(null)}
      />
    </div>
  );
};
