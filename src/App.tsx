/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { NavSection, Transaction } from './types/finance';
import { getCurrentMonthKey } from './utils/format';
import { useFinanceStore } from './hooks/useFinanceStore';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen bg-slate-50 text-slate-900">
        <Sidebar
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          totalAssets={totalAssets}
          accountCount={state.accounts.length}
          onOpenDataModal={() => setDataModalOpen(true)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            activeSection={activeSection}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onOpenAddTransaction={() => openAddTransaction({ type: 'expense' })}
          />

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
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
                    onNavigate={setActiveSection}
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

        <OfflineIndicator />
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      </div>
    </MotionConfig>
  );
}
