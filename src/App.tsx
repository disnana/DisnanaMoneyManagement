/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Component,
  ErrorInfo,
  ReactNode,
  TouchEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { haptic } from './utils/haptics';
import { NavSection, Transaction } from './types/finance';
import { getCurrentMonthKey } from './utils/format';
import { useFinanceStore } from './hooks/useFinanceStore';
import { useIsDesktop } from './hooks/useMediaQuery';
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

const MOBILE_TAB_ORDER: NavSection[] = [
  'dashboard',
  'transactions',
  'accounts',
  'analytics',
  'budgets',
  'planning',
  'tax',
];

function shouldIgnoreTabSwipe(
  target: EventTarget | null,
  boundary: HTMLElement | null
): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== boundary) {
    const tag = el.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      el.dataset.noTabSwipe === 'true'
    ) {
      return true;
    }
    const style = window.getComputedStyle(el);
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth + 4
    ) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

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
        <div className="flex h-[100dvh] items-center justify-center bg-slate-50 p-6 text-slate-900">
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
                className="min-h-[44px] rounded-xl bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800"
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
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
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
    addTransactionsBatch,
    updateTransaction,
    deleteTransaction,
    deleteSettlementGroup,
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

  const isDesktop = useIsDesktop();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const tabSwipeRef = useRef<{
    startX: number;
    startY: number;
    locked: 'h' | 'v' | null;
  } | null>(null);

  const scrollPositionsRef = useRef<Partial<Record<NavSection, number>>>({});
  const prevSectionRef = useRef<NavSection>('dashboard');
  const slideDirRef = useRef<1 | -1 | 0>(0);

  const handleSelectSection = useCallback((section: NavSection) => {
    const prev = prevSectionRef.current;
    const el = mainScrollRef.current;
    if (prev === section) {
      // Re-tap on the active tab: scroll back to top (native behaviour)
      el?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (el) scrollPositionsRef.current[prev] = el.scrollTop;
    slideDirRef.current =
      MOBILE_TAB_ORDER.indexOf(section) > MOBILE_TAB_ORDER.indexOf(prev) ? 1 : -1;
    setActiveSection(section);
  }, []);

  // Restore each tab's scroll position (top for first visit)
  useLayoutEffect(() => {
    if (prevSectionRef.current === activeSection) return;
    prevSectionRef.current = activeSection;
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = scrollPositionsRef.current[activeSection] ?? 0;
    }
  }, [activeSection]);

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

  const handleSaveTransactionBatch = (
    txs: Omit<Transaction, 'id'>[],
    summaryTitle: string
  ) => {
    addTransactionsBatch(txs);
    showToast(`「${summaryTitle}」を${txs.length}件まとめて記帳しました`);
  };

  const handleMainTouchStart = (e: TouchEvent<HTMLElement>) => {
    if (isDesktop || txModalOpen || dataModalOpen || e.touches.length !== 1) {
      tabSwipeRef.current = null;
      return;
    }
    if (document.querySelector('[role="dialog"]')) {
      tabSwipeRef.current = null;
      return;
    }
    if (shouldIgnoreTabSwipe(e.target, mainScrollRef.current)) {
      tabSwipeRef.current = null;
      return;
    }
    const touch = e.touches[0];
    tabSwipeRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      locked: null,
    };
  };

  const handleMainTouchMove = (e: TouchEvent<HTMLElement>) => {
    const stateRef = tabSwipeRef.current;
    if (!stateRef || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - stateRef.startX;
    const dy = touch.clientY - stateRef.startY;

    if (stateRef.locked === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
      stateRef.locked = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'h' : 'v';
    }
  };

  const handleMainTouchEnd = (e: TouchEvent<HTMLElement>) => {
    const stateRef = tabSwipeRef.current;
    tabSwipeRef.current = null;
    if (!stateRef || stateRef.locked !== 'h' || e.changedTouches.length !== 1) {
      return;
    }
    if (document.querySelector('[role="dialog"]')) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - stateRef.startX;
    const dy = touch.clientY - stateRef.startY;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.35) return;

    const currentIdx = MOBILE_TAB_ORDER.indexOf(activeSection);
    if (currentIdx === -1) return;

    if (dx < 0 && currentIdx < MOBILE_TAB_ORDER.length - 1) {
      handleSelectSection(MOBILE_TAB_ORDER[currentIdx + 1]);
    } else if (dx > 0 && currentIdx > 0) {
      handleSelectSection(MOBILE_TAB_ORDER[currentIdx - 1]);
    }
  };

  const renderActiveView = () => (
    <>
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
          onDeleteSettlementGroup={(groupId) => {
            deleteSettlementGroup(groupId);
            showToast('連動する外貨・Stripe決済セットを削除しました');
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
          onChangeMonth={setSelectedMonth}
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
          onOpenFxPayout={() => openAddTransaction({ mode: 'fx_payout' })}
          onEditTransaction={openEditTransaction}
        />
      )}
    </>
  );

  return (
    <AppErrorBoundary>
      <MotionConfig reducedMotion="user">
        <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-50 text-slate-900">
          <Sidebar
            activeSection={activeSection}
            onSelectSection={handleSelectSection}
            totalAssets={totalAssets}
            accountCount={state.accounts.length}
            onOpenDataModal={() => setDataModalOpen(true)}
          />

          <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar
              activeSection={activeSection}
              onOpenAddTransaction={() => openAddTransaction({ type: 'expense' })}
            />

            <main
              ref={mainScrollRef}
              onTouchStart={handleMainTouchStart}
              onTouchMove={handleMainTouchMove}
              onTouchEnd={handleMainTouchEnd}
              onTouchCancel={() => {
                tabSwipeRef.current = null;
              }}
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y"
            >
              <div className="mx-auto w-full max-w-7xl overflow-x-clip px-4 pt-5 pb-28 sm:px-8 sm:py-8 lg:pb-8">
                {isDesktop ? (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeSection}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {renderActiveView()}
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <motion.div
                    key={activeSection}
                    initial={
                      slideDirRef.current === 0
                        ? false
                        : { opacity: 0, x: slideDirRef.current * 28 }
                    }
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.7 }}
                  >
                    {renderActiveView()}
                  </motion.div>
                )}
              </div>
            </main>

            {/* Mobile floating action button (replaces header button below lg) */}
            <button
              type="button"
              onClick={() => {
                haptic(10);
                openAddTransaction({ type: 'expense' });
              }}
              aria-label="収支を記録"
              className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-30 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-lg shadow-teal-900/25 transition-transform duration-100 active:scale-90 lg:hidden"
              style={{ marginRight: 'env(safe-area-inset-right, 0px)' }}
            >
              <Plus className="h-6 w-6" strokeWidth={2.4} />
            </button>

            <MobileBottomNav
              activeSection={activeSection}
              onSelectSection={handleSelectSection}
              totalAssets={totalAssets}
              accountCount={state.accounts.length}
              onOpenDataModal={() => setDataModalOpen(true)}
            />
          </div>

          <TransactionModal
            open={txModalOpen}
            editingTransaction={editingTx}
            accounts={state.accounts}
            prefill={txPrefill}
            onClose={() => setTxModalOpen(false)}
            onSave={handleSaveTransaction}
            onSaveBatch={handleSaveTransactionBatch}
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
    </AppErrorBoundary>
  );
}
