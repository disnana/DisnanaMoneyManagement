/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component, ErrorInfo, ReactNode, useCallback, useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { NavSection, Transaction } from './types/finance';
import { getCurrentMonthKey } from './utils/format';
import { useFinanceStore } from './hooks/useFinanceStore';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { DashboardView } from './components/DashboardView';
import { AnalyticsView } from './components/AnalyticsView';
import { TransactionsView } from './components/TransactionsView';
import { BudgetsView } from './components/BudgetsView';
import { AccountsView } from './components/AccountsView';
import { PlanningView } from './components/PlanningView';
import { TaxView } from './components/TaxView';
import {
  TransactionModal,
  TransactionModalPrefill,
} from './components/TransactionModal';
import { DataModal } from './components/DataModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { Toast } from './components/Toast';

interface ErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Handled via UI fallback
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              画面の表示中に問題が発生しました
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              ブラウザに保存されているデータ形式との不整合などが原因の可能性があります。再読み込みをお試しください。
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800"
              >
                再読み込みする
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('kakeibo_finance_state_v3');
                  } catch {
                    // ignore
                  }
                  window.location.reload();
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                初期データに戻して再読み込み
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const {
    state,
    accountBalances,
    totalAssets,
    accountNameMap,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addAccount,
    updateAccount,
    deleteAccount,
    upsertBudget,
    removeBudget,
    addRecurringItem,
    deleteRecurringItem,
    recordRecurringForMonth,
    addSavingsGoal,
    contributeToGoal,
    deleteSavingsGoal,
    importState,
    resetToSampleData,
    clearAllData,
  } = useFinanceStore();

  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey);

  const handleSelectSection = useCallback((section: NavSection) => {
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txPrefill, setTxPrefill] = useState<TransactionModalPrefill | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2800);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const openAddTransaction = (prefill: TransactionModalPrefill = { type: 'expense' }) => {
    setEditingTx(null);
    setTxPrefill(prefill);
    setTxModalOpen(true);
  };

  const openEditTransaction = (tx: Transaction) => {
    setEditingTx(tx);
    setTxPrefill(null);
    setTxModalOpen(true);
  };

  const handleSaveTransaction = (
    payload: Omit<Transaction, 'id'>,
    existingId?: string
  ) => {
    if (existingId) {
      updateTransaction(existingId, payload);
      showToast(`「${payload.title}」を更新しました`);
    } else {
      addTransaction(payload);
      showToast(`「${payload.title}」を記録しました`);
    }
  };

  return (
    <AppErrorBoundary>
      <MotionConfig reducedMotion="user">
        <div className="flex min-h-screen overflow-x-clip bg-slate-50 text-slate-900">
        <Sidebar
          activeSection={activeSection}
          onSelectSection={handleSelectSection}
          totalAssets={totalAssets}
          accountCount={state.accounts.length}
          onOpenDataModal={() => setDataModalOpen(true)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            activeSection={activeSection}
            onOpenAddTransaction={() => openAddTransaction({ type: 'expense' })}
          />

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-24 sm:px-8 sm:py-8 lg:pb-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeSection === 'dashboard' && (
                  <DashboardView
                    state={state}
                    accountBalances={accountBalances}
                    selectedMonth={selectedMonth}
                    onChangeMonth={setSelectedMonth}
                    totalAssets={totalAssets}
                    accountNameMap={accountNameMap}
                    onNavigate={handleSelectSection}
                    onOpenAddTransaction={() => openAddTransaction({ type: 'expense' })}
                    onEditTransaction={openEditTransaction}
                  />
                )}

                {activeSection === 'analytics' && (
                  <AnalyticsView
                    state={state}
                    selectedMonth={selectedMonth}
                    onChangeMonth={setSelectedMonth}
                    accountNameMap={accountNameMap}
                  />
                )}

                {activeSection === 'transactions' && (
                  <TransactionsView
                    transactions={state.transactions}
                    accounts={state.accounts}
                    accountNameMap={accountNameMap}
                    selectedMonth={selectedMonth}
                    onEditTransaction={openEditTransaction}
                    onDeleteTransaction={(id) => {
                      deleteTransaction(id);
                      showToast('取引を削除しました');
                    }}
                    onOpenAddTransaction={() => openAddTransaction({ type: 'expense' })}
                  />
                )}

                {activeSection === 'budgets' && (
                  <BudgetsView
                    budgets={state.budgets}
                    transactions={state.transactions}
                    selectedMonth={selectedMonth}
                    onChangeMonth={setSelectedMonth}
                    onUpsertBudget={(b) => {
                      upsertBudget(b);
                      showToast('予算を保存しました');
                    }}
                    onRemoveBudget={(catId) => {
                      removeBudget(catId);
                      showToast('予算設定を削除しました');
                    }}
                  />
                )}

                {activeSection === 'accounts' && (
                  <AccountsView
                    accounts={state.accounts}
                    transactions={state.transactions}
                    accountBalances={accountBalances}
                    totalAssets={totalAssets}
                    selectedMonth={selectedMonth}
                    onAddAccount={(acc) => {
                      addAccount(acc);
                      showToast(`「${acc.name}」を追加しました`);
                    }}
                    onUpdateAccount={(id, patch) => {
                      updateAccount(id, patch);
                      showToast('口座・カード情報を更新しました');
                    }}
                    onDeleteAccount={(id) => {
                      deleteAccount(id);
                      showToast('口座・カードを削除しました');
                    }}
                    onOpenPrefilledTransaction={openAddTransaction}
                  />
                )}

                {activeSection === 'planning' && (
                  <PlanningView
                    recurringItems={state.recurringItems}
                    savingsGoals={state.savingsGoals}
                    transactions={state.transactions}
                    accounts={state.accounts}
                    accountNameMap={accountNameMap}
                    selectedMonth={selectedMonth}
                    onAddRecurring={(item) => {
                      addRecurringItem(item);
                      showToast(`定期項目「${item.title}」を追加しました`);
                    }}
                    onDeleteRecurring={(id) => {
                      deleteRecurringItem(id);
                      showToast('定期項目を削除しました');
                    }}
                    onRecordRecurring={(item, monthKey) => {
                      recordRecurringForMonth(item, monthKey);
                      showToast(`「${item.title}」を記帳しました`);
                    }}
                    onAddGoal={(goal) => {
                      addSavingsGoal(goal);
                      showToast(`貯蓄目標「${goal.title}」を追加しました`);
                    }}
                    onContributeGoal={(id, delta) => {
                      contributeToGoal(id, delta);
                      showToast('貯蓄目標を更新しました');
                    }}
                    onDeleteGoal={(id) => {
                      deleteSavingsGoal(id);
                      showToast('貯蓄目標を削除しました');
                    }}
                  />
                )}

                {activeSection === 'tax' && (
                  <TaxView
                    transactions={state.transactions}
                    accounts={state.accounts}
                    accountNameMap={accountNameMap}
                    onOpenAddBusinessExpense={() =>
                      openAddTransaction({ type: 'expense', scope: 'business' })
                    }
                    onOpenAddIncome={() =>
                      openAddTransaction({ type: 'income', scope: 'business' })
                    }
                    onEditTransaction={openEditTransaction}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        <TransactionModal
          open={txModalOpen}
          editingTransaction={editingTx}
          accounts={state.accounts}
          prefill={txPrefill}
          onClose={() => setTxModalOpen(false)}
          onSave={handleSaveTransaction}
        />

        <DataModal
          open={dataModalOpen}
          state={state}
          accountNameMap={accountNameMap}
          onClose={() => setDataModalOpen(false)}
          onImportState={(next) => {
            importState(next);
            showToast('バックアップデータを復元しました');
          }}
          onResetToSample={() => {
            resetToSampleData();
            showToast('サンプルデータを再読み込みしました');
          }}
          onClearAll={() => {
            clearAllData();
            showToast('すべてのデータを消去しました');
          }}
        />

        <MobileBottomNav
          activeSection={activeSection}
          onSelectSection={handleSelectSection}
          totalAssets={totalAssets}
          accountCount={state.accounts.length}
          onOpenDataModal={() => setDataModalOpen(true)}
        />

        <OfflineIndicator />
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
        </div>
      </MotionConfig>
    </AppErrorBoundary>
  );
}
