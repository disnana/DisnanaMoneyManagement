import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowRightLeft, ArrowDownLeft, ArrowUpRight, Briefcase, User } from 'lucide-react';
import {
  Account,
  IncomeTaxCategory,
  ReceiptMethod,
  Transaction,
  TransactionScope,
  TransactionType,
} from '../types/finance';
import {
  ACCOUNTING_SUBJECTS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_USAGE_LABELS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  INCOME_TAX_CATEGORY_LABELS,
  RECEIPT_METHOD_LABELS,
  getCategoryById,
} from '../data/categories';
import { formatJPY, getCurrentMonthKey, getTodayString, shiftMonth } from '../utils/format';
import { ResponsiveSheet } from './ResponsiveSheet';

export interface TransactionModalPrefill {
  type?: TransactionType;
  accountId?: string;
  toAccountId?: string;
  amount?: number;
  title?: string;
  isPrepayment?: boolean;
  targetBillingMonth?: string;
  scope?: TransactionScope;
}

interface TransactionModalProps {
  open: boolean;
  editingTransaction: Transaction | null;
  accounts: Account[];
  prefill?: TransactionModalPrefill | null;
  onClose: () => void;
  onSave: (tx: Omit<Transaction, 'id'>, existingId?: string) => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  open,
  editingTransaction,
  accounts,
  prefill,
  onClose,
  onSave,
}) => {
  const amountInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<TransactionType>('expense');
  const [scope, setScope] = useState<TransactionScope>('personal');
  const [amountStr, setAmountStr] = useState('');
  const [pointUsedStr, setPointUsedStr] = useState('');
  const [transferFeeStr, setTransferFeeStr] = useState('');
  const [date, setDate] = useState(getTodayString());
  const [categoryId, setCategoryId] = useState(EXPENSE_CATEGORIES[0].id);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');

  const [accountingSubject, setAccountingSubject] = useState('消耗品費');
  const [businessRatio, setBusinessRatio] = useState(100);
  const [counterparty, setCounterparty] = useState('');

  const [receiptMethod, setReceiptMethod] = useState<ReceiptMethod>('bank_transfer');
  const [incomeTaxCategory, setIncomeTaxCategory] = useState<IncomeTaxCategory>('salary');
  const [withholdingTaxStr, setWithholdingTaxStr] = useState('');

  const [isPrepayment, setIsPrepayment] = useState(false);
  const [targetBillingMonth, setTargetBillingMonth] = useState(getCurrentMonthKey());

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingTransaction) {
      setType(editingTransaction.type);
      setScope(editingTransaction.scope ?? 'personal');
      setAmountStr(String(editingTransaction.amount));
      setPointUsedStr(
        editingTransaction.pointUsed ? String(editingTransaction.pointUsed) : ''
      );
      setTransferFeeStr(
        editingTransaction.transferFee ? String(editingTransaction.transferFee) : ''
      );
      setDate(editingTransaction.date);
      setCategoryId(editingTransaction.categoryId);
      setAccountId(editingTransaction.accountId);
      setToAccountId(
        editingTransaction.toAccountId ??
          accounts.find((a) => a.id !== editingTransaction.accountId)?.id ??
          accounts[0]?.id ??
          ''
      );
      setTitle(editingTransaction.title);
      setMemo(editingTransaction.memo ?? '');
      setAccountingSubject(
        editingTransaction.accountingSubject ??
          getCategoryById(editingTransaction.categoryId).defaultAccountingSubject ??
          '雑費'
      );
      setBusinessRatio(
        editingTransaction.businessRatio ??
          (editingTransaction.scope === 'business' ? 100 : 0)
      );
      setCounterparty(editingTransaction.counterparty ?? '');
      setReceiptMethod(editingTransaction.receiptMethod ?? 'bank_transfer');
      setIncomeTaxCategory(editingTransaction.incomeTaxCategory ?? 'salary');
      setWithholdingTaxStr(
        editingTransaction.withholdingTax ? String(editingTransaction.withholdingTax) : ''
      );
      setIsPrepayment(Boolean(editingTransaction.isPrepayment));
      setTargetBillingMonth(
        editingTransaction.targetBillingMonth ?? getCurrentMonthKey()
      );
    } else {
      const defType = prefill?.type ?? 'expense';
      const initialAccId = prefill?.accountId ?? accounts[0]?.id ?? '';
      const initialAcc = accounts.find((a) => a.id === initialAccId);
      const inferredScope: TransactionScope =
        prefill?.scope ??
        (initialAcc?.usageScope === 'business' ? 'business' : 'personal');

      setType(defType);
      setScope(inferredScope);
      setAmountStr(prefill?.amount ? String(prefill.amount) : '');
      setPointUsedStr('');
      setTransferFeeStr('');
      setDate(getTodayString());
      setCategoryId(
        defType === 'income'
          ? INCOME_CATEGORIES[0].id
          : defType === 'transfer'
          ? 'transfer'
          : EXPENSE_CATEGORIES[0].id
      );
      setAccountId(initialAccId);
      setToAccountId(
        prefill?.toAccountId ??
          accounts.find((a) => a.id !== initialAccId)?.id ??
          accounts[0]?.id ??
          ''
      );
      setTitle(prefill?.title ?? '');
      setMemo('');
      setAccountingSubject(EXPENSE_CATEGORIES[0].defaultAccountingSubject ?? '消耗品費');
      setBusinessRatio(inferredScope === 'business' ? 100 : 0);
      setCounterparty('');
      setReceiptMethod('bank_transfer');
      setIncomeTaxCategory('salary');
      setWithholdingTaxStr('');
      setIsPrepayment(Boolean(prefill?.isPrepayment));
      setTargetBillingMonth(prefill?.targetBillingMonth ?? getCurrentMonthKey());

      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 60);
    }
  }, [open, editingTransaction, prefill, accounts]);

  const selectedToAccount = useMemo(
    () => accounts.find((a) => a.id === toAccountId),
    [accounts, toAccountId]
  );

  // Filter out debit cards when choosing a transfer target/source (debit has no standalone balance)
  const transferEligibleAccounts = useMemo(
    () => accounts.filter((a) => a.type !== 'debit'),
    [accounts]
  );

  const numericAmount = Number(amountStr) || 0;
  const numericPoints = Math.max(0, Number(pointUsedStr) || 0);
  const numericFee = Math.max(0, Number(transferFeeStr) || 0);
  const numericWithholding = Math.max(0, Number(withholdingTaxStr) || 0);

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    setError(null);
    if (nextType === 'expense') {
      if (!EXPENSE_CATEGORIES.some((c) => c.id === categoryId)) {
        const firstCat = EXPENSE_CATEGORIES[0];
        setCategoryId(firstCat.id);
        setAccountingSubject(firstCat.defaultAccountingSubject ?? '消耗品費');
      }
    } else if (nextType === 'income') {
      if (!INCOME_CATEGORIES.some((c) => c.id === categoryId)) {
        setCategoryId(INCOME_CATEGORIES[0].id);
      }
    } else {
      setCategoryId('transfer');
      const bankFirst =
        transferEligibleAccounts.find((a) => a.type === 'bank') ??
        transferEligibleAccounts[0];
      if (bankFirst && accounts.find((a) => a.id === accountId)?.type === 'debit') {
        setAccountId(bankFirst.id);
      }
      if (toAccountId === accountId && transferEligibleAccounts.length > 1) {
        const other = transferEligibleAccounts.find((a) => a.id !== accountId);
        if (other) setToAccountId(other.id);
      }
    }
  };

  const handleAccountChange = (nextAccountId: string) => {
    setAccountId(nextAccountId);
    if (!editingTransaction) {
      const acc = accounts.find((a) => a.id === nextAccountId);
      if (acc?.usageScope === 'business') {
        setScope('business');
        if (businessRatio === 0) setBusinessRatio(100);
      } else if (acc?.usageScope === 'personal' || acc?.usageScope === 'household') {
        setScope('personal');
        setBusinessRatio(0);
      }
    }
  };

  const handleScopeChange = (nextScope: TransactionScope) => {
    setScope(nextScope);
    if (nextScope === 'business' && businessRatio === 0) {
      setBusinessRatio(100);
    } else if (nextScope === 'personal') {
      setBusinessRatio(0);
    }
  };

  const handleCategoryChange = (nextCatId: string) => {
    setCategoryId(nextCatId);
    const cat = getCategoryById(nextCatId);
    if (cat.defaultAccountingSubject) {
      setAccountingSubject(cat.defaultAccountingSubject);
    }
    if (nextCatId === 'salary') {
      setIncomeTaxCategory('salary');
      setReceiptMethod('bank_transfer');
    } else if (nextCatId === 'side_income') {
      setIncomeTaxCategory('business');
      setScope('business');
    } else if (nextCatId === 'misc_income') {
      setIncomeTaxCategory('miscellaneous');
    } else if (nextCatId === 'investment_income') {
      setIncomeTaxCategory('dividend');
    }
  };

  const handleReceiptMethodChange = (method: ReceiptMethod) => {
    setReceiptMethod(method);
    if (
      method === 'amazon_gift' ||
      method === 'other_gift' ||
      method === 'points' ||
      method === 'crypto'
    ) {
      if (incomeTaxCategory === 'salary') {
        setIncomeTaxCategory('miscellaneous');
      }
    }
  };

  const handleQuickAddAmount = (delta: number) => {
    const current = Number(amountStr) || 0;
    setAmountStr(String(current + delta));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('金額は1円以上の数値を入力してください。');
      return;
    }
    if (!accountId) {
      setError('口座を選択してください。');
      return;
    }
    if (type === 'expense' && numericPoints > numericAmount) {
      setError('ポイント充当額は支払総額以下に指定してください。');
      return;
    }
    if (type === 'income' && numericWithholding >= numericAmount) {
      setError('源泉徴収税額は収入総額より小さくしてください。');
      return;
    }
    if (type === 'transfer') {
      if (!toAccountId || toAccountId === accountId) {
        setError('振替先には振替元と異なる口座を選択してください。');
        return;
      }
    }

    const trimmedTitle = title.trim();
    const fallbackTitle =
      type === 'transfer'
        ? selectedToAccount?.type === 'credit'
          ? isPrepayment
            ? `${selectedToAccount.name} 先払い・繰上返済`
            : `${selectedToAccount.name} 引き落とし`
          : '口座間振替'
        : type === 'income'
        ? INCOME_CATEGORIES.find((c) => c.id === categoryId)?.name ?? '収入'
        : EXPENSE_CATEGORIES.find((c) => c.id === categoryId)?.name ?? '支出';

    const effectiveRatio =
      type === 'expense'
        ? scope === 'business'
          ? Math.min(100, Math.max(0, businessRatio))
          : 0
        : undefined;

    onSave(
      {
        type,
        amount: Math.round(numericAmount),
        date,
        categoryId: type === 'transfer' ? 'transfer' : categoryId,
        accountId,
        toAccountId: type === 'transfer' ? toAccountId : undefined,
        title: trimmedTitle || fallbackTitle,
        memo: memo.trim() || undefined,
        scope,
        transferFee:
          type === 'transfer' && numericFee > 0 ? Math.round(numericFee) : undefined,
        pointUsed:
          type === 'expense' && numericPoints > 0
            ? Math.round(numericPoints)
            : undefined,
        businessRatio: effectiveRatio,
        accountingSubject:
          type === 'expense' && scope === 'business' ? accountingSubject : undefined,
        counterparty: counterparty.trim() || undefined,
        receiptMethod: type === 'income' ? receiptMethod : undefined,
        incomeTaxCategory: type === 'income' ? incomeTaxCategory : undefined,
        withholdingTax:
          type === 'income' && numericWithholding > 0
            ? Math.round(numericWithholding)
            : undefined,
        isPrepayment:
          type === 'transfer' && selectedToAccount?.type === 'credit'
            ? isPrepayment
            : undefined,
        targetBillingMonth:
          type === 'transfer' && selectedToAccount?.type === 'credit'
            ? targetBillingMonth
            : undefined,
      },
      editingTransaction?.id
    );
    onClose();
  };

  const activeCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const billingMonthChoices = [
    shiftMonth(getCurrentMonthKey(), -1),
    getCurrentMonthKey(),
    shiftMonth(getCurrentMonthKey(), 1),
    shiftMonth(getCurrentMonthKey(), 2),
  ];

  const accountSelectPool =
    type === 'transfer' ? transferEligibleAccounts : accounts;

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      title={editingTransaction ? '取引を編集' : '新しい取引を記録'}
      titleId="tx-modal-title"
      maxWidthClass="sm:max-w-xl"
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98]"
          >
            キャンセル
          </button>
          <button
            type="submit"
            form="tx-modal-form"
            className="min-h-[44px] whitespace-nowrap rounded-xl bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98]"
          >
            {editingTransaction ? '変更を保存' : '記録を追加'}
          </button>
        </div>
      }
    >
      <form id="tx-modal-form" onSubmit={handleSubmit} className="space-y-5">
        {/* Type & Scope Bar */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 sm:flex-1">
            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                type === 'expense'
                  ? 'bg-white text-red-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
              <span>支出</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('income')}
              className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                type === 'income'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowDownLeft className="h-3.5 w-3.5 shrink-0" />
              <span>収入</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('transfer')}
              className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                type === 'transfer'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
              <span>口座振替</span>
            </button>
          </div>

          <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto sm:inline-grid">
            <button
              type="button"
              onClick={() => handleScopeChange('personal')}
              className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                scope === 'personal'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="h-3.5 w-3.5 shrink-0" />
              <span>個人</span>
            </button>
            <button
              type="button"
              onClick={() => handleScopeChange('business')}
              className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                scope === 'business'
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5 shrink-0" />
              <span>事業・経費</span>
            </button>
          </div>
        </div>

        {/* Amount Input */}
        <div>
          <label htmlFor="tx-amount" className="block text-xs font-medium text-slate-600">
            {type === 'expense'
              ? '支払総額 (円)'
              : type === 'income'
              ? '収入総額・額面 (円)'
              : '振替金額 (円)'}
          </label>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-lg font-semibold text-slate-400">
              ¥
            </span>
            <input
              ref={amountInputRef}
              id="tx-amount"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              required
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0"
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-4 font-mono text-2xl font-semibold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {[1000, 3000, 5000, 10000].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => handleQuickAddAmount(val)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.98] tabular-nums"
              >
                +¥{val.toLocaleString('ja-JP')}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tx-date" className="block text-xs font-medium text-slate-600">
              日付
            </label>
            <input
              id="tx-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
            />
          </div>

                {type !== 'transfer' ? (
                  <div>
                    <label
                      htmlFor="tx-category"
                      className="block text-xs font-medium text-slate-600"
                    >
                      カテゴリ
                    </label>
                    <select
                      id="tx-category"
                      value={categoryId}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                    >
                      {activeCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="tx-to-account"
                      className="block text-xs font-medium text-slate-600"
                    >
                      振替先口座・カード
                    </label>
                    <select
                      id="tx-to-account"
                      value={toAccountId}
                      onChange={(e) => setToAccountId(e.target.value)}
                      className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                    >
                      {transferEligibleAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}（{ACCOUNT_TYPE_LABELS[acc.type]}）
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="tx-account" className="block text-xs font-medium text-slate-600">
                    {type === 'income'
                      ? '受取先口座・ウォレット'
                      : type === 'transfer'
                      ? '振替元口座'
                      : '支払い方法（口座・カード）'}
                  </label>
                  <select
                    id="tx-account"
                    value={accountId}
                    onChange={(e) => handleAccountChange(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  >
                    {accountSelectPool.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} · {ACCOUNT_USAGE_LABELS[acc.usageScope ?? 'personal']}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="tx-title" className="block text-xs font-medium text-slate-600">
                    項目名・内容
                  </label>
                  <input
                    id="tx-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      type === 'income'
                        ? '例: 記事執筆謝礼、給与、業務委託費'
                        : type === 'transfer'
                        ? '例: 銀行から引き出し、カード先払い'
                        : '例: スーパー、備品購入、新幹線'
                    }
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              {type === 'transfer' && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="tx-fee" className="text-xs font-medium text-slate-700">
                        振替・振込手数料 (円)
                      </label>
                      <span className="font-mono text-xs text-slate-500 tabular-nums">
                        振替元からの総出金額: {formatJPY(numericAmount + numericFee)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        id="tx-fee"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={transferFeeStr}
                        onChange={(e) => setTransferFeeStr(e.target.value)}
                        placeholder="0"
                        className="min-h-[42px] w-32 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-semibold text-slate-900 tabular-nums"
                      />
                      {[0, 110, 220, 440].map((fee) => (
                        <button
                          key={fee}
                          type="button"
                          onClick={() =>
                            setTransferFeeStr(fee === 0 ? '' : String(fee))
                          }
                          className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-medium text-slate-700 hover:bg-slate-100 active:scale-[0.98] tabular-nums"
                        >
                          ¥{fee}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedToAccount?.type === 'credit' && (
                    <div className="space-y-3 border-t border-slate-200 pt-3">
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-800">
                        <input
                          type="checkbox"
                          checked={isPrepayment}
                          onChange={(e) => setIsPrepayment(e.target.checked)}
                          className="h-5 w-5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                        />
                        <span>先払い・繰上返済として記録する（利用枠を即時回復）</span>
                      </label>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">
                          充当先の請求月
                        </label>
                        <select
                          value={targetBillingMonth}
                          onChange={(e) => setTargetBillingMonth(e.target.value)}
                          className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                        >
                          {billingMonthChoices.map((m) => (
                            <option key={m} value={m}>
                              {Number(m.slice(0, 4))}年{Number(m.slice(5, 7))}月 支払分
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {type === 'expense' && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="tx-points"
                        className="block text-xs font-medium text-slate-700"
                      >
                        うちポイント充当 (円/pt)
                      </label>
                      <input
                        id="tx-points"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={pointUsedStr}
                        onChange={(e) => setPointUsedStr(e.target.value)}
                        placeholder="0"
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-semibold text-slate-900 tabular-nums"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <div className="flex min-h-[44px] items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                        <span>口座・カード実請求額</span>
                        <strong className="font-mono text-sm text-slate-900 tabular-nums">
                          {formatJPY(Math.max(0, numericAmount - numericPoints))}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {scope === 'business' && (
                    <div className="space-y-3 border-t border-slate-200 pt-3">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            勘定科目（確定申告・帳簿用）
                          </label>
                          <select
                            value={accountingSubject}
                            onChange={(e) => setAccountingSubject(e.target.value)}
                            className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                          >
                            {ACCOUNTING_SUBJECTS.map((subj) => (
                              <option key={subj} value={subj}>
                                {subj}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            支払先・取引先（任意）
                          </label>
                          <input
                            type="text"
                            value={counterparty}
                            onChange={(e) => setCounterparty(e.target.value)}
                            placeholder="例: Amazon、JR東日本"
                            className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-slate-700">
                            家事按分率: <strong className="font-mono">{businessRatio}%</strong>
                          </span>
                          <span className="font-mono text-teal-800 tabular-nums">
                            経費算入額:{' '}
                            {formatJPY(Math.round(numericAmount * (businessRatio / 100)))}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={businessRatio}
                            onChange={(e) => setBusinessRatio(Number(e.target.value))}
                            className="min-h-[36px] min-w-[140px] flex-1 accent-teal-700"
                          />
                          {[100, 50, 30].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setBusinessRatio(pct)}
                              className={`min-h-[40px] rounded-xl border px-3 py-1.5 font-mono text-xs active:scale-[0.98] ${
                                businessRatio === pct
                                  ? 'border-teal-700 bg-teal-50 font-semibold text-teal-800'
                                  : 'border-slate-200 bg-white text-slate-600'
                              }`}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {type === 'income' && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        受取形態（何の形で受け取ったか）
                      </label>
                      <select
                        value={receiptMethod}
                        onChange={(e) =>
                          handleReceiptMethodChange(e.target.value as ReceiptMethod)
                        }
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                      >
                        {(Object.keys(RECEIPT_METHOD_LABELS) as ReceiptMethod[]).map(
                          (k) => (
                            <option key={k} value={k}>
                              {RECEIPT_METHOD_LABELS[k]}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        所得区分（税務処理用）
                      </label>
                      <select
                        value={incomeTaxCategory}
                        onChange={(e) =>
                          setIncomeTaxCategory(e.target.value as IncomeTaxCategory)
                        }
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                      >
                        {(
                          Object.keys(INCOME_TAX_CATEGORY_LABELS) as IncomeTaxCategory[]
                        ).map((k) => (
                          <option key={k} value={k}>
                            {INCOME_TAX_CATEGORY_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        支払元・取引先名（任意）
                      </label>
                      <input
                        type="text"
                        value={counterparty}
                        onChange={(e) => setCounterparty(e.target.value)}
                        placeholder="例: 株式会社〇〇、クラウドワークス"
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="block text-xs font-medium text-slate-700">
                          源泉徴収税額 (円・任意)
                        </label>
                        {numericWithholding > 0 && (
                          <span className="font-mono text-[11px] text-emerald-700 tabular-nums">
                            手取り:{' '}
                            {formatJPY(Math.max(0, numericAmount - numericWithholding))}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={withholdingTaxStr}
                        onChange={(e) => setWithholdingTaxStr(e.target.value)}
                        placeholder="0"
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-semibold text-slate-900 tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="tx-memo" className="block text-xs font-medium text-slate-600">
                  メモ（任意）
                </label>
                <input
                  id="tx-memo"
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="補足情報、領収書番号、内訳など"
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}
      </form>
    </ResponsiveSheet>
  );
};
