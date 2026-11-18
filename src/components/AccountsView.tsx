import React, { useEffect, useMemo, useState } from 'react';
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
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Banknote,
} from 'lucide-react';
import { Account, AccountType, AccountUsageScope, Transaction } from '../types/finance';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_USAGE_LABELS } from '../data/categories';
import {
  formatDayLabel,
  formatFullDate,
  formatJPY,
  formatMonthLabel,
  getCurrentMonthKey,
  getEffectiveOutflow,
} from '../utils/format';
import { computeCreditCardSummary, getCycleRangeLabel } from '../utils/creditCard';
import { ConfirmDialog } from './ConfirmDialog';
import { TransactionModalPrefill } from './TransactionModal';

interface AccountsViewProps {
  accounts: Account[];
  transactions: Transaction[];
  accountBalances: Record<string, number>;
  totalAssets: number;
  selectedMonth: string;
  onAddAccount: (acc: Omit<Account, 'id'>) => void;
  onUpdateAccount: (id: string, patch: Partial<Omit<Account, 'id'>>) => void;
  onDeleteAccount: (id: string) => void;
  onOpenPrefilledTransaction: (prefill: TransactionModalPrefill) => void;
}

const ACCOUNT_ICONS: Record<AccountType, React.ComponentType<{ className?: string }>> = {
  bank: Landmark,
  credit: CreditCard,
  debit: Banknote,
  cash: Wallet,
  emoney: Smartphone,
  investment: TrendingUp,
};

const ALL_ACCOUNT_TYPES: AccountType[] = [
  'bank',
  'credit',
  'debit',
  'cash',
  'emoney',
  'investment',
];

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
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [usageScope, setUsageScope] = useState<AccountUsageScope>('personal');
  const [initialBalance, setInitialBalance] = useState('0');
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

  useEffect(() => {
    if (!modalOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [modalOpen]);

  const openAdd = (presetType: AccountType = 'bank') => {
    setEditingAccount(null);
    setName('');
    setType(presetType);
    setUsageScope('personal');
    setInitialBalance('0');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const initVal = Number(initialBalance) || 0;
    const payload: Omit<Account, 'id'> = {
      name: name.trim(),
      type,
      usageScope,
      initialBalance: type === 'debit' ? 0 : Math.round(initVal),
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

    if (editingAccount) {
      onUpdateAccount(editingAccount.id, payload);
    } else {
      onAddAccount(payload);
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-8">
      {/* Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            口座・カード管理
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            個人用・家庭用・業務用の区分ごとに、銀行口座・クレジットカード・デビットカードを整理できます
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onOpenPrefilledTransaction({ type: 'transfer' })}
            disabled={accounts.length < 2}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span>口座間で振替</span>
          </button>
          <button
            type="button"
            onClick={() => openAdd('credit')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>カードを追加</span>
          </button>
          <button
            type="button"
            onClick={() => openAdd('bank')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>口座を追加</span>
          </button>
        </div>
      </div>

      {/* Scope Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap rounded-lg bg-slate-100 p-1">
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
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
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

      {/* Credit & Debit Cards Section */}
      {(creditCards.length > 0 || debitCards.length > 0) && (
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900">
              登録カード（クレジットカード・デビットカード）
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
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
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
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
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
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
                          className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
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
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
                      >
                        先払い・繰上返済
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(card)}
                        className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`${card.name}の設定を編集`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {accounts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDeletingAccount(card)}
                          className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
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
                  <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedCardId(isExpanded ? null : card.id)}
                      className="flex w-full items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      <span>
                        今月・来月の利用明細内訳を表示（今月{' '}
                        {summary.thisMonthTransactions.length}件 / 来月{' '}
                        {summary.nextMonthTransactions.length}件）
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
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
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                        <Banknote className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
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
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
                      >
                        + デビット決済を記録
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(card)}
                        className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`${card.name}の設定を編集`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {accounts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDeletingAccount(card)}
                          className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
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
          銀行口座・現金・電子マネー・投資口座
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
                            {acc.institution && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="break-words">{acc.institution}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEdit(acc)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`${acc.name}を編集`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {accounts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDeletingAccount(acc)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`${acc.name}を削除`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

                  <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenPrefilledTransaction({
                          type: 'expense',
                          accountId: acc.id,
                          scope: acc.usageScope === 'business' ? 'business' : 'personal',
                        })
                      }
                      className="text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
                    >
                      この口座で記録
                    </button>
                    <span
                      className={`font-mono text-xl font-bold tabular-nums ${
                        balance < 0 ? 'text-red-600' : 'text-slate-900'
                      }`}
                    >
                      {formatJPY(balance)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Add / Edit Account & Card Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            key="acc-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
                <h3 className="text-base font-semibold text-slate-900">
                  {editingAccount ? '口座・カード情報を編集' : '新しい口座・カードを追加'}
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

              <form onSubmit={handleSubmit} className="space-y-5 p-6">
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
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium leading-tight transition-colors ${
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
                  <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                    {USAGE_SCOPES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setUsageScope(s)}
                        className={`rounded-md py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
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
                          : '例: 三菱UFJ銀行（普通）'
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="acc-inst"
                      className="block text-xs font-medium text-slate-600"
                    >
                      金融機関・発行会社（任意）
                    </label>
                    <input
                      id="acc-inst"
                      type="text"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      placeholder="例: 三井住友カード、みずほ銀行"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Initial Balance (hidden for debit cards since they link directly to bank) */}
                {type !== 'debit' && (
                  <div>
                    <label
                      htmlFor="acc-init"
                      className="block text-xs font-medium text-slate-600"
                    >
                      {type === 'credit'
                        ? '登録時点の未決済残高（通常 0、負債がある場合はマイナスまたは 0）'
                        : '開始時残高 (円)'}
                    </label>
                    <input
                      id="acc-init"
                      type="number"
                      step="1"
                      required
                      value={initialBalance}
                      onChange={(e) => setInitialBalance(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-semibold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                )}

                {/* Credit Card Specific Settings */}
                {type === 'credit' && (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <CheckCircle2 className="h-3.5 w-3.5 text-teal-700" />
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
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
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
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
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
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
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
                          min="0"
                          step="10000"
                          value={creditLimit}
                          onChange={(e) => setCreditLimit(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-semibold tabular-nums"
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
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
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
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <CheckCircle2 className="h-3.5 w-3.5 text-sky-700" />
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
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
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
                          min="0"
                          step="10000"
                          value={creditLimit}
                          onChange={(e) => setCreditLimit(e.target.value)}
                          placeholder="0 = 上限なし"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-semibold tabular-nums"
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
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
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
                    className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800"
                  >
                    保存する
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
        onConfirm={() => {
          if (deletingAccount) {
            onDeleteAccount(deletingAccount.id);
            setDeletingAccount(null);
          }
        }}
        onCancel={() => setDeletingAccount(null)}
      />
    </div>
  );
};
