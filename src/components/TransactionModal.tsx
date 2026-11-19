import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Briefcase,
  User,
  Globe,
} from 'lucide-react';
import {
  Account,
  CurrencyCode,
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
  CURRENCY_META,
  EXPENSE_CATEGORIES,
  FOREIGN_CURRENCIES,
  INCOME_CATEGORIES,
  INCOME_TAX_CATEGORY_LABELS,
  RECEIPT_METHOD_LABELS,
  getCategoryById,
} from '../data/categories';
import {
  formatForeignCurrency,
  formatJPY,
  getCurrentMonthKey,
  getTodayString,
  shiftMonth,
} from '../utils/format';
import { ResponsiveSheet } from './ResponsiveSheet';
import { ChevronLeft as StepPrev, ChevronRight as StepNext } from 'lucide-react';
import { haptic } from '../utils/haptics';

export interface TransactionModalPrefill {
  mode?: 'standard' | 'fx_payout';
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
  onSaveBatch: (txs: Omit<Transaction, 'id'>[], summaryTitle: string) => void;
}

type ModalTab = TransactionType | 'fx_payout';

function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d + delta);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function formatDateWithWeekday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, d).getDay()];
  return `${y}年${m}月${d}日(${wd})`;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  open,
  editingTransaction,
  accounts,
  prefill,
  onClose,
  onSave,
  onSaveBatch,
}) => {
  const amountInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<ModalTab>('expense');
  const [scope, setScope] = useState<TransactionScope>('personal');
  const [amountStr, setAmountStr] = useState('');
  const [pointUsedStr, setPointUsedStr] = useState('');
  const [transferFeeStr, setTransferFeeStr] = useState('');
  const [transferFxFeeStr, setTransferFxFeeStr] = useState('');
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

  // FX / Stripe Gross-to-Net Wizard State
  const [fxCurrency, setFxCurrency] = useState<CurrencyCode>('USD');
  const [fxGrossStr, setFxGrossStr] = useState('');
  const [fxRateStr, setFxRateStr] = useState(String(CURRENCY_META.USD.defaultRate));
  const [stage1FeeStr, setStage1FeeStr] = useState('');
  const [stage1FeeUnit, setStage1FeeUnit] = useState<'fx' | 'jpy'>('fx');
  const [stage2FeeStr, setStage2FeeStr] = useState('');
  const [stage2FeeUnit, setStage2FeeUnit] = useState<'jpy' | 'pct'>('jpy');
  const [fxTaxCategory, setFxTaxCategory] = useState<'business' | 'miscellaneous'>('business');

  const [error, setError] = useState<string | null>(null);
  const continueRef = useRef(false);

  const bankAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'bank' || a.type === 'psp'),
    [accounts]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingTransaction) {
      setActiveTab(editingTransaction.type);
      setScope(editingTransaction.scope ?? 'personal');
      setAmountStr(String(editingTransaction.amount));
      setPointUsedStr(
        editingTransaction.pointUsed ? String(editingTransaction.pointUsed) : ''
      );
      setTransferFeeStr(
        editingTransaction.transferFee ? String(editingTransaction.transferFee) : ''
      );
      setTransferFxFeeStr(
        editingTransaction.fxConversionFee
          ? String(editingTransaction.fxConversionFee)
          : ''
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
      const initialMode = prefill?.mode === 'fx_payout' ? 'fx_payout' : null;
      const defType: ModalTab = initialMode ?? prefill?.type ?? 'expense';

      const defaultBizBank =
        accounts.find((a) => a.type === 'bank' && a.usageScope === 'business')?.id ??
        accounts.find((a) => a.type === 'bank')?.id ??
        accounts[0]?.id ??
        '';
      const initialAccId =
        prefill?.accountId ??
        (defType === 'fx_payout' ? defaultBizBank : accounts[0]?.id ?? '');
      const initialAcc = accounts.find((a) => a.id === initialAccId);
      const inferredScope: TransactionScope =
        defType === 'fx_payout'
          ? 'business'
          : prefill?.scope ??
            (initialAcc?.usageScope === 'business' ? 'business' : 'personal');

      setActiveTab(defType);
      setScope(inferredScope);
      setAmountStr(prefill?.amount ? String(prefill.amount) : '');
      setPointUsedStr('');
      setTransferFeeStr('');
      setTransferFxFeeStr('');
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

      // FX defaults
      setFxCurrency('USD');
      setFxGrossStr('');
      setFxRateStr(String(CURRENCY_META.USD.defaultRate));
      setStage1FeeStr('');
      setStage1FeeUnit('fx');
      setStage2FeeStr('');
      setStage2FeeUnit('jpy');
      setFxTaxCategory('business');

      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 60);
    }
  }, [open, editingTransaction, prefill, accounts]);

  const selectedFromAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  );

  const selectedToAccount = useMemo(
    () => accounts.find((a) => a.id === toAccountId),
    [accounts, toAccountId]
  );

  // Filter out debit cards when choosing a transfer target/source (debit has no standalone balance)
  const transferEligibleAccounts = useMemo(
    () => accounts.filter((a) => a.type !== 'debit'),
    [accounts]
  );

  const isFxTransfer =
    activeTab === 'transfer' &&
    (selectedFromAccount?.type === 'foreign_bank' ||
      selectedFromAccount?.type === 'psp' ||
      selectedToAccount?.type === 'foreign_bank' ||
      selectedToAccount?.type === 'psp');

  const numericAmount = Number(amountStr) || 0;
  const numericPoints = Math.max(0, Number(pointUsedStr) || 0);
  const isCardPayment = activeTab === 'transfer' && selectedToAccount?.type === 'credit';
  const allowsPoints = activeTab === 'expense' || isCardPayment;
  const numericFee = Math.max(0, Number(transferFeeStr) || 0);
  const numericTransferFxFee = Math.max(0, Number(transferFxFeeStr) || 0);
  const numericWithholding = Math.max(0, Number(withholdingTaxStr) || 0);

  // Real-time FX Payout Calculations
  const fxSummary = useMemo(() => {
    const grossForeign = Math.max(0, Number(fxGrossStr) || 0);
    const rate = Math.max(0, Number(fxRateStr) || 0);
    const grossJpy = Math.round(grossForeign * rate);

    const rawStage1 = Math.max(0, Number(stage1FeeStr) || 0);
    const stage1FeeJpy =
      stage1FeeUnit === 'fx' ? Math.round(rawStage1 * rate) : Math.round(rawStage1);

    const afterStage1Jpy = Math.max(0, grossJpy - stage1FeeJpy);
    const rawStage2 = Math.max(0, Number(stage2FeeStr) || 0);
    const stage2FeeJpy =
      stage2FeeUnit === 'pct'
        ? Math.round(afterStage1Jpy * (rawStage2 / 100))
        : Math.round(rawStage2);

    const totalFeesJpy = stage1FeeJpy + stage2FeeJpy;
    const netJpy = grossJpy - totalFeesJpy;

    return {
      grossForeign,
      rate,
      grossJpy,
      stage1FeeJpy,
      stage2FeeJpy,
      totalFeesJpy,
      netJpy,
    };
  }, [fxGrossStr, fxRateStr, stage1FeeStr, stage1FeeUnit, stage2FeeStr, stage2FeeUnit]);

  const handleTabChange = (nextTab: ModalTab) => {
    setActiveTab(nextTab);
    setError(null);
    if (nextTab === 'fx_payout') {
      setScope('business');
      const bizBank =
        accounts.find((a) => a.type === 'bank' && a.usageScope === 'business')?.id ??
        accounts.find((a) => a.type === 'bank')?.id ??
        accounts[0]?.id ??
        '';
      if (bizBank) setAccountId(bizBank);
      return;
    }

    if (nextTab === 'expense') {
      if (!EXPENSE_CATEGORIES.some((c) => c.id === categoryId)) {
        const firstCat = EXPENSE_CATEGORIES[0];
        setCategoryId(firstCat.id);
        setAccountingSubject(firstCat.defaultAccountingSubject ?? '消耗品費');
      }
    } else if (nextTab === 'income') {
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
    } else if (method === 'stripe_payout' || method === 'foreign_fx') {
      if (incomeTaxCategory === 'salary') {
        setIncomeTaxCategory('business');
        setScope('business');
      }
    }
  };

  const handleQuickAddAmount = (delta: number) => {
    const current = Number(amountStr) || 0;
    setAmountStr(String(current + delta));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (activeTab === 'fx_payout') {
      if (fxSummary.grossForeign <= 0 || fxSummary.rate <= 0 || fxSummary.grossJpy <= 0) {
        setError('外貨売上額と適用為替レートには0より大きい数値を入力してください。');
        return;
      }
      if (fxSummary.netJpy <= 0) {
        setError('手数料合計が総売上高以上になっています。手数料額をご確認ください。');
        return;
      }
      if (!accountId) {
        setError('着金先の銀行または決済口座を選択してください。');
        return;
      }

      const groupId = `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const baseTitle =
        title.trim() ||
        `海外収益 (${formatForeignCurrency(fxSummary.grossForeign, fxCurrency)} → Stripe着金)`;
      const partnerName = counterparty.trim() || 'Stripe / 海外プラットフォーム';

      const batch: Omit<Transaction, 'id'>[] = [
        {
          type: 'income',
          amount: fxSummary.grossJpy,
          date,
          categoryId: fxTaxCategory === 'business' ? 'side_income' : 'misc_income',
          accountId,
          title: baseTitle,
          memo: [
            `総売上 ${formatForeignCurrency(fxSummary.grossForeign, fxCurrency)} @ ¥${fxSummary.rate}`,
            fxSummary.stage1FeeJpy > 0
              ? `移行手数料 ${formatJPY(fxSummary.stage1FeeJpy)}`
              : null,
            fxSummary.stage2FeeJpy > 0
              ? `Stripe為替手数料 ${formatJPY(fxSummary.stage2FeeJpy)}`
              : null,
            `純入金額 ${formatJPY(fxSummary.netJpy)}`,
            memo.trim() || null,
          ]
            .filter(Boolean)
            .join(' · '),
          scope: 'business',
          receiptMethod: 'stripe_payout',
          incomeTaxCategory: fxTaxCategory,
          counterparty: partnerName,
          foreignCurrency: fxCurrency,
          foreignGrossAmount: fxSummary.grossForeign,
          fxRate: fxSummary.rate,
          platformTransferFee: fxSummary.stage1FeeJpy || undefined,
          fxConversionFee: fxSummary.stage2FeeJpy || undefined,
          netJpyAmount: fxSummary.netJpy,
          settlementGroupId: groupId,
        },
      ];

      if (fxSummary.stage1FeeJpy > 0) {
        batch.push({
          type: 'expense',
          amount: fxSummary.stage1FeeJpy,
          date,
          categoryId: 'business_ops',
          accountId,
          title: `[第1段階移行手数料] ${baseTitle}`,
          memo: `${fxCurrency}プラットフォーム → Stripe 移行時控除`,
          scope: 'business',
          businessRatio: 100,
          accountingSubject: '支払手数料',
          counterparty: partnerName,
          foreignCurrency: fxCurrency,
          fxRate: fxSummary.rate,
          settlementGroupId: groupId,
        });
      }

      if (fxSummary.stage2FeeJpy > 0) {
        batch.push({
          type: 'expense',
          amount: fxSummary.stage2FeeJpy,
          date,
          categoryId: 'business_ops',
          accountId,
          title: `[第2段階Stripe為替手数料] ${baseTitle}`,
          memo: `Stripe 円転・為替・銀行出金控除`,
          scope: 'business',
          businessRatio: 100,
          accountingSubject: '支払手数料',
          counterparty: 'Stripe',
          foreignCurrency: fxCurrency,
          fxRate: fxSummary.rate,
          settlementGroupId: groupId,
        });
      }

      onSaveBatch(batch, baseTitle);
      onClose();
      return;
    }

    const type = activeTab;
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('金額は1円以上の数値を入力してください。');
      return;
    }
    if (!accountId) {
      setError('口座を選択してください。');
      return;
    }
    if (allowsPoints && numericPoints > numericAmount) {
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
          : isFxTransfer
          ? `${selectedFromAccount?.name ?? '外貨'} → ${selectedToAccount?.name ?? '口座'} 送金`
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
        fxConversionFee:
          type === 'transfer' && numericTransferFxFee > 0
            ? Math.round(numericTransferFxFee)
            : undefined,
        pointUsed:
          allowsPoints && numericPoints > 0
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
    if (continueRef.current && !editingTransaction) {
      // Keep the page open for rapid consecutive entry
      continueRef.current = false;
      haptic(12);
      setAmountStr('');
      setTitle('');
      setMemo('');
      setPointUsedStr('');
      setTransferFeeStr('');
      setTransferFxFeeStr('');
      setCounterparty('');
      setError(null);
      return;
    }
    continueRef.current = false;
    onClose();
  };

  const activeCategories = activeTab === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const billingMonthChoices = [
    shiftMonth(getCurrentMonthKey(), -1),
    getCurrentMonthKey(),
    shiftMonth(getCurrentMonthKey(), 1),
    shiftMonth(getCurrentMonthKey(), 2),
  ];

  const accountSelectPool =
    activeTab === 'transfer'
      ? transferEligibleAccounts
      : activeTab === 'fx_payout'
      ? bankAccounts.length > 0
        ? bankAccounts
        : accounts
      : accounts;

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      title={
        editingTransaction
          ? '取引を編集'
          : activeTab === 'fx_payout'
          ? '外貨・Stripe 一括入金記帳'
          : '収支を記録'
      }
      titleId="tx-modal-title"
      maxWidthClass="sm:max-w-xl"
      fullScreenMobile
      footer={
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="hidden min-h-[44px] whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] sm:block"
          >
            キャンセル
          </button>
          {!editingTransaction && activeTab !== 'fx_payout' && (
            <button
              type="submit"
              form="tx-modal-form"
              onClick={() => {
                continueRef.current = true;
              }}
              className="order-2 min-h-[44px] whitespace-nowrap rounded-xl px-4 py-2 text-[15px] font-medium text-teal-700 transition-opacity active:opacity-50 sm:order-none sm:border sm:border-teal-700 sm:bg-white sm:text-sm sm:font-semibold sm:text-teal-800 sm:hover:bg-teal-50"
            >
              続けて登録
            </button>
          )}
          <button
            type="submit"
            form="tx-modal-form"
            onClick={() => {
              continueRef.current = false;
            }}
            className="min-h-[52px] whitespace-nowrap rounded-2xl bg-teal-700 px-6 py-2.5 text-[17px] font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] sm:min-h-[44px] sm:rounded-xl sm:text-sm"
          >
            {editingTransaction
              ? '変更を保存'
              : activeTab === 'fx_payout'
              ? '売上と手数料を一括記帳'
              : '登録'}
          </button>
        </div>
      }
    >
      <form id="tx-modal-form" onSubmit={handleSubmit} className="space-y-5">
        {/* Date stepper (phones) */}
        <div className="flex items-center justify-between sm:hidden">
          <button
            type="button"
            aria-label="前の日"
            onClick={() => setDate((d) => shiftDay(d, -1))}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <StepPrev className="h-5 w-5" />
          </button>
          <label className="relative flex min-h-[44px] flex-1 cursor-pointer items-center justify-center text-[17px] font-semibold text-slate-900 tabular-nums">
            {formatDateWithWeekday(date)}
            <input
              type="date"
              aria-label="日付を選択"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="keep-font absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <button
            type="button"
            aria-label="次の日"
            onClick={() => setDate((d) => shiftDay(d, 1))}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <StepNext className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex flex-col gap-2.5">
          <div
            className={`grid gap-1 rounded-xl bg-slate-100 p-1 ${
              editingTransaction ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'
            }`}
          >
            <button
              type="button"
              onClick={() => handleTabChange('expense')}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'expense'
                  ? 'bg-white text-red-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
              <span>支出</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('income')}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'income'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowDownLeft className="h-3.5 w-3.5 shrink-0" />
              <span>収入</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('transfer')}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'transfer'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
              <span>口座振替</span>
            </button>
            {!editingTransaction && (
              <button
                type="button"
                onClick={() => handleTabChange('fx_payout')}
                className={`hidden min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap sm:flex ${
                  activeTab === 'fx_payout'
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <span>外貨・Stripe</span>
              </button>
            )}
          </div>

          {activeTab !== 'fx_payout' && (
            <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
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
          )}
          {!editingTransaction && (
            <button
              type="button"
              onClick={() => handleTabChange(activeTab === 'fx_payout' ? 'expense' : 'fx_payout')}
              className="self-center py-1 text-[13px] font-medium text-teal-700 active:opacity-50 sm:hidden"
            >
              {activeTab === 'fx_payout' ? '通常の収支に戻る' : '外貨・Stripeの入金として記帳'}
            </button>
          )}
        </div>

        {activeTab === 'fx_payout' ? (
          /* ================= FX & STRIPE GROSS-TO-NET WIZARD ================= */
          <div className="space-y-4">
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 px-4 py-3 text-xs leading-relaxed text-teal-950">
              外貨の<strong>総売上高</strong>と、①プラットフォーム→Stripe移行手数料・②Stripe為替出金手数料（いずれも「支払手数料」経費）を自動分離し、銀行口座へ正確な<strong>純入金額</strong>を記帳します。
            </div>

            {/* Currency & Tax Category */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600">外貨の種類</label>
                <div className="mt-1.5 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
                  {FOREIGN_CURRENCIES.map((cur) => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => {
                        setFxCurrency(cur);
                        setFxRateStr(String(CURRENCY_META[cur].defaultRate));
                      }}
                      className={`min-h-[40px] rounded-lg font-mono text-xs font-semibold transition-colors ${
                        fxCurrency === cur
                          ? 'bg-white text-teal-800 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600">
                  所得区分（確定申告用）
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setFxTaxCategory('business')}
                    className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors ${
                      fxTaxCategory === 'business'
                        ? 'bg-white text-teal-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    事業所得
                  </button>
                  <button
                    type="button"
                    onClick={() => setFxTaxCategory('miscellaneous')}
                    className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors ${
                      fxTaxCategory === 'miscellaneous'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    雑所得
                  </button>
                </div>
              </div>
            </div>

            {/* Gross Foreign Amount + FX Rate */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="fx-gross"
                  className="block text-xs font-medium text-slate-600"
                >
                  外貨総売上額 ({CURRENCY_META[fxCurrency].code})
                </label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm font-semibold text-slate-400">
                    {CURRENCY_META[fxCurrency].symbol}
                  </span>
                  <input
                    ref={amountInputRef}
                    id="fx-gross"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    required
                    value={fxGrossStr}
                    onChange={(e) => setFxGrossStr(e.target.value)}
                    placeholder="1000.00"
                    className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 font-mono text-lg font-semibold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="fx-rate"
                  className="block text-xs font-medium text-slate-600"
                >
                  適用為替レート (1 {fxCurrency} = 円)
                </label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm font-semibold text-slate-400">
                    ¥
                  </span>
                  <input
                    id="fx-rate"
                    type="number"
                    inputMode="decimal"
                    min="0.1"
                    step="0.01"
                    required
                    value={fxRateStr}
                    onChange={(e) => setFxRateStr(e.target.value)}
                    placeholder="152.00"
                    className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 font-mono text-lg font-semibold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Stage 1 & Stage 2 Fee Deductions */}
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="fx-fee1" className="text-xs font-medium text-slate-700">
                    ① プラットフォーム → Stripe 移行手数料
                  </label>
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    円換算: {formatJPY(fxSummary.stage1FeeJpy)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id="fx-fee1"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={stage1FeeUnit === 'fx' ? '0.01' : '1'}
                    value={stage1FeeStr}
                    onChange={(e) => setStage1FeeStr(e.target.value)}
                    placeholder="0"
                    className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm font-semibold text-slate-900 tabular-nums"
                  />
                  <div className="grid grid-cols-2 rounded-xl bg-slate-200/80 p-1">
                    <button
                      type="button"
                      onClick={() => setStage1FeeUnit('fx')}
                      className={`min-h-[38px] rounded-lg px-3 font-mono text-xs font-semibold ${
                        stage1FeeUnit === 'fx'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {fxCurrency}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStage1FeeUnit('jpy')}
                      className={`min-h-[38px] rounded-lg px-3 font-mono text-xs font-semibold ${
                        stage1FeeUnit === 'jpy'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      JPY
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="fx-fee2" className="text-xs font-medium text-slate-700">
                    ② Stripe 為替変換・出金手数料
                  </label>
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    控除額: {formatJPY(fxSummary.stage2FeeJpy)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id="fx-fee2"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={stage2FeeUnit === 'pct' ? '0.1' : '1'}
                    value={stage2FeeStr}
                    onChange={(e) => setStage2FeeStr(e.target.value)}
                    placeholder="0"
                    className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm font-semibold text-slate-900 tabular-nums"
                  />
                  <div className="grid grid-cols-2 rounded-xl bg-slate-200/80 p-1">
                    <button
                      type="button"
                      onClick={() => setStage2FeeUnit('jpy')}
                      className={`min-h-[38px] rounded-lg px-3 font-mono text-xs font-semibold ${
                        stage2FeeUnit === 'jpy'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      JPY
                    </button>
                    <button
                      type="button"
                      onClick={() => setStage2FeeUnit('pct')}
                      className={`min-h-[38px] rounded-lg px-3 font-mono text-xs font-semibold ${
                        stage2FeeUnit === 'pct'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      %
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { label: '為替 2.0%', val: '2.0', unit: 'pct' as const },
                    { label: 'Stripe標準 3.6%', val: '3.6', unit: 'pct' as const },
                    { label: '手数料 ¥0', val: '', unit: 'jpy' as const },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setStage2FeeUnit(preset.unit);
                        setStage2FeeStr(preset.val);
                      }}
                      className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Gross-to-Net Preview Panel */}
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="text-slate-600">総売上高（帳簿・申告上の売上）</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatJPY(fxSummary.grossJpy)}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="text-slate-600">控除手数料合計（支払手数料として経費計上）</span>
                <span className="font-mono font-semibold text-red-600 tabular-nums">
                  -{formatJPY(fxSummary.totalFeesJpy)}
                </span>
              </div>
              <div className="flex items-center justify-between bg-emerald-50/50 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-900">純利益 / 銀行純入金額</span>
                <span className="font-mono text-base font-bold text-emerald-700 tabular-nums">
                  {formatJPY(fxSummary.netJpy)}
                </span>
              </div>
            </div>

            {/* Target Bank & Metadata */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600">日付</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600">
                  最終着金先口座（銀行等）
                </label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  {accountSelectPool.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} · {ACCOUNT_USAGE_LABELS[acc.usageScope ?? 'personal']}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600">案件・項目名</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例: 海外SaaS売上 / Patreon報酬"
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600">
                  支払元・プラットフォーム名（任意）
                </label>
                <input
                  type="text"
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  placeholder="例: Stripe / Gumroad / App Store"
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">メモ（任意）</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="インボイス番号・決済バッチIDなど"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
              />
            </div>
          </div>
        ) : (
          /* ================= STANDARD EXPENSE / INCOME / TRANSFER ================= */
          <>
            {/* Amount Input */}
            <div>
              <label htmlFor="tx-amount" className="block text-xs font-medium text-slate-600 max-sm:text-center">
                {activeTab === 'expense'
                  ? '支払総額 (円)'
                  : activeTab === 'income'
                  ? '収入総額・額面 (円)'
                  : '着金・振替金額 (円)'}
              </label>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-lg font-semibold text-slate-400 max-sm:hidden">
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
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-4 font-mono text-2xl font-semibold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 keep-font max-sm:min-h-[72px] max-sm:border-0 max-sm:bg-transparent max-sm:pl-4 max-sm:text-center max-sm:!text-[40px] max-sm:focus:ring-0"
                />
              </div>
              <div className="mt-2 hidden gap-2 sm:flex sm:flex-wrap">
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
              <div className="max-sm:hidden">
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

              {activeTab !== 'transfer' ? (
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
                  {activeTab === 'income'
                    ? '受取先口座・ウォレット'
                    : activeTab === 'transfer'
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
                    activeTab === 'income'
                      ? '例: 記事執筆謝礼、給与、業務委託費'
                      : activeTab === 'transfer'
                      ? '例: Stripeから銀行出金、カード先払い'
                      : '例: スーパー、備品購入、新幹線'
                  }
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            {activeTab === 'transfer' && (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="tx-fee" className="text-xs font-medium text-slate-700">
                      振替・移行手数料 (円)
                    </label>
                    <span className="font-mono text-xs text-slate-500 tabular-nums">
                      振替元からの総出金額:{' '}
                      {formatJPY(numericAmount + numericFee + numericTransferFxFee)}
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

                {isFxTransfer && (
                  <div className="border-t border-slate-200 pt-3">
                    <label
                      htmlFor="tx-fx-fee"
                      className="block text-xs font-medium text-slate-700"
                    >
                      為替・Stripe/PSP決済手数料 (円・任意)
                    </label>
                    <input
                      id="tx-fx-fee"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={transferFxFeeStr}
                      onChange={(e) => setTransferFxFeeStr(e.target.value)}
                      placeholder="0"
                      className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-semibold text-slate-900 tabular-nums"
                    />
                  </div>
                )}

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

            {allowsPoints && (
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
                      <span>{isCardPayment ? '口座からの出金額（手数料別）' : '口座・カード実請求額'}</span>
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

            {activeTab === 'income' && (
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
                      {(Object.keys(RECEIPT_METHOD_LABELS) as ReceiptMethod[]).map((k) => (
                        <option key={k} value={k}>
                          {RECEIPT_METHOD_LABELS[k]}
                        </option>
                      ))}
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
                      placeholder="例: 株式会社〇〇、Stripe"
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
          </>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
            {error}
          </div>
        )}
      </form>
    </ResponsiveSheet>
  );
};
