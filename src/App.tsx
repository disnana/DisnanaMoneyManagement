/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Activity,
  Component,
  ErrorInfo,
  ReactNode,
  TouchEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  startTransition,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { enterTab, leaveTabs, setTabBackHandler } from './utils/navHistory';
import { useViewportVars } from './hooks/useViewportVars';
import { useNativeKeyboard } from './hooks/useNativeKeyboard';
import { KeyboardAccessory } from './components/KeyboardAccessory';
import { MobileMenuSheet } from './components/mobile/MobileMenuSheet';
import { SectionTabs, groupOf } from './components/mobile/SectionTabs';
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
import { WriteErrorDialog } from './components/WriteErrorDialog';

const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const LARGE_TITLES: Record<NavSection, string> = {
  dashboard: 'ホーム',
  transactions: '取引',
  analytics: '分析・予算',
  budgets: '分析・予算',
  accounts: '口座・固定費',
  planning: '口座・固定費',
  tax: '経費・税務',
};

const MOBILE_TAB_ORDER: NavSection[] = [
  'dashboard',
  'transactions',
  'analytics',
  'budgets',
  'accounts',
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
    writeError,
    dismissWriteError,
  } = useFinanceStore();

  useViewportVars();
  useNativeKeyboard();
  const isDesktop = useIsDesktop();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Phones: every visited (and idle-preloaded) tab stays mounted, hidden via <Activity> -> switching is just show/hide
  const [warm, setWarm] = useState<NavSection[]>(['dashboard']);
  // navSection updates instantly (tab highlight); activeSection (heavy content) follows in a low-priority transition
  const [navSection, setNavSection] = useState<NavSection>('dashboard');
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

  const handleSelectSection = useCallback((section: NavSection) => {
    const prev = prevSectionRef.current;
    const el = mainScrollRef.current;
    if (prev === section) {
      // Re-tap on the active tab: scroll back to top (native behaviour)
      el?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (el) scrollPositionsRef.current[prev] = el.scrollTop;
    if (section === 'dashboard') leaveTabs();
    else enterTab();
    setNavSection(section);
    startTransition(() => setActiveSection(section));
  }, []);

  useEffect(() => {
    // System back from a non-home tab returns to Home
    setTabBackHandler(() => {
      const prev = prevSectionRef.current;
      if (prev === 'dashboard') return;
      if (mainScrollRef.current) scrollPositionsRef.current[prev] = mainScrollRef.current.scrollTop;
      // iOS edge-swipe-back mirrors our swipe direction (previous tab); Android back goes Home
      const idx = MOBILE_TAB_ORDER.indexOf(prev);
      const target: NavSection =
        IS_IOS && idx > 0 ? MOBILE_TAB_ORDER[idx - 1] : 'dashboard';
      if (target !== 'dashboard') enterTab();
      setNavSection(target);
      startTransition(() => setActiveSection(target));
    });
  }, []);

  useEffect(() => {
    if (isDesktop) return;
    setWarm((w) => (w.includes(activeSection) ? w : [...w, activeSection]));
  }, [activeSection, isDesktop]);

  // Preload the remaining tabs one by one while the main thread is idle
  useEffect(() => {
    if (isDesktop) return;
    const order: NavSection[] = ['transactions', 'analytics', 'accounts', 'budgets', 'planning'];
    const idle: (cb: () => void) => number =
      typeof window.requestIdleCallback === 'function'
        ? (cb) => window.requestIdleCallback(cb, { timeout: 2500 })
        : (cb) => window.setTimeout(cb, 600);
    let cancelled = false;
    let i = 0;
    const next = () => {
      if (cancelled || i >= order.length) return;
      const sec = order[i++];
      startTransition(() => setWarm((w) => (w.includes(sec) ? w : [...w, sec])));
      idle(next);
    };
    const first = window.setTimeout(() => idle(next), 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
    };
  }, [isDesktop]);

  // Restore each tab's scroll position (top for first visit)
  useLayoutEffect(() => {
    if (prevSectionRef.current === activeSection) return;
    prevSectionRef.current = activeSection;
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = scrollPositionsRef.current[activeSection] ?? 0;
      setScrolled(mainScrollRef.current.scrollTop > 34);
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

  // PC: press N to record a new transaction (when not typing); PWA shortcuts: ?action=add / ?tab=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as NavSection | null;
    if (tab && MOBILE_TAB_ORDER.includes(tab)) setActiveSection(tab);
    if (params.get('action') === 'add') {
      setEditingTx(null);
      setTxPrefill({ type: 'expense' });
      setTxModalOpen(true);
    }
    if (params.has('action') || params.has('tab')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'n') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      setEditingTx(null);
      setTxPrefill({ type: 'expense' });
      setTxModalOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const notifySaved = async (write: Promise<boolean>, message: string) => {
    setToastMessage(null);
    const saved = await write;
    if (saved) showToast(message);
    return saved;
  };

  const handleSaveTransaction = (payload: Omit<Transaction, 'id'>, existingId?: string) =>
    existingId
      ? notifySaved(updateTransaction(existingId, payload), `「${payload.title}」を更新しました`)
      : notifySaved(addTransaction(payload), `「${payload.title}」を記録しました`);

  const handleSaveTransactionBatch = (txs: Omit<Transaction, 'id'>[], summaryTitle: string) =>
    notifySaved(addTransactionsBatch(txs), `「${summaryTitle}」を${txs.length}件まとめて記帳しました`);

  const handleMainTouchStart = (e: TouchEvent<HTMLElement>) => {
    if (isDesktop || txModalOpen || dataModalOpen || e.touches.length !== 1) {
      tabSwipeRef.current = null;
      return;
    }
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
      tabSwipeRef.current = null;
      return;
    }
    if (shouldIgnoreTabSwipe(e.target, mainScrollRef.current)) {
      tabSwipeRef.current = null;
      return;
    }
    const touch = e.touches[0];
    // Leave the screen edge to the OS back gesture (iOS/Android) so the two never double-fire
    if (touch.clientX < 28 || touch.clientX > window.innerWidth - 28) {
      tabSwipeRef.current = null;
      return;
    }
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
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

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

  const renderView = (activeSection: NavSection) => (
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
          onDeleteTransaction={(id) => notifySaved(deleteTransaction(id), '取引を削除しました')}
          onDeleteSettlementGroup={(groupId) => notifySaved(deleteSettlementGroup(groupId), '連動する外貨・Stripe決済セットを削除しました')}
          onOpenAddTransaction={() => openAddTransaction({ type: 'expense' })}
        />
      )}

      {activeSection === 'budgets' && (
        <BudgetsView
          budgets={state.budgets.filter((budget) => budget.ledgerId === undefined)}
          transactions={state.transactions}
          selectedMonth={selectedMonth}
          onChangeMonth={setSelectedMonth}
          onUpsertBudget={(b) => notifySaved(upsertBudget(b), '予算を保存しました')}
          onRemoveBudget={(catId) => notifySaved(removeBudget(catId), '予算設定を削除しました')}
        />
      )}

      {activeSection === 'accounts' && (
        <AccountsView
          accounts={state.accounts}
          transactions={state.transactions}
          accountBalances={accountBalances}
          totalAssets={totalAssets}
          selectedMonth={selectedMonth}
          onAddAccount={(acc) => notifySaved(addAccount(acc), `「${acc.name}」を追加しました`)}
          onUpdateAccount={(id, patch) => notifySaved(updateAccount(id, patch), '口座・カード情報を更新しました')}
          onDeleteAccount={(id) => notifySaved(deleteAccount(id), '口座・カードを削除しました')}
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
          onAddRecurring={(item) => notifySaved(addRecurringItem(item), `定期項目「${item.title}」を追加しました`)}
          onDeleteRecurring={(id) => notifySaved(deleteRecurringItem(id), '定期項目を削除しました')}
          onRecordRecurring={(item, monthKey) => notifySaved(recordRecurringForMonth(item, monthKey), `「${item.title}」を記帳しました`)}
          onAddGoal={(goal) => notifySaved(addSavingsGoal(goal), `貯蓄目標「${goal.title}」を追加しました`)}
          onContributeGoal={(id, delta) => notifySaved(contributeToGoal(id, delta), '貯蓄目標を更新しました')}
          onDeleteGoal={(id) => notifySaved(deleteSavingsGoal(id), '貯蓄目標を削除しました')}
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
  const renderActiveView = () => renderView(activeSection);

  return (
    <AppErrorBoundary>
      <MotionConfig reducedMotion="user">
        <div className="flex h-full w-full overflow-hidden bg-[var(--app-bg)] text-slate-900 lg:bg-slate-50">
          <Sidebar
            activeSection={navSection}
            onSelectSection={handleSelectSection}
            totalAssets={totalAssets}
            accountCount={state.accounts.length}
            onOpenDataModal={() => setDataModalOpen(true)}
          />

          <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar
              activeSection={navSection}
              onOpenAddTransaction={() => openAddTransaction({ type: 'expense' })}
              onOpenMenu={() => setMenuOpen(true)}
              onBack={() => handleSelectSection('dashboard')}
              scrolled={scrolled}
            />

            <main
              ref={mainScrollRef}
              onScroll={(e) => {
                const past = e.currentTarget.scrollTop > 34;
                setScrolled((prev) => (prev === past ? prev : past));
              }}
              onTouchStart={handleMainTouchStart}
              onTouchMove={handleMainTouchMove}
              onTouchEnd={handleMainTouchEnd}
              onTouchCancel={() => {
                tabSwipeRef.current = null;
              }}
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y"
            >
              <div className="mx-auto w-full max-w-7xl overflow-x-clip pt-5 pb-8 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-8 sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))]">
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
                  <>
                    <h2 className="mx-auto mb-3 w-full max-w-2xl px-1 text-[32px] font-bold leading-tight tracking-tight text-slate-900">
                      {LARGE_TITLES[activeSection]}
                    </h2>
                    {groupOf(activeSection) && (
                      <SectionTabs
                        group={groupOf(activeSection)!}
                        active={navSection}
                        onSelect={handleSelectSection}
                      />
                    )}
                    {MOBILE_TAB_ORDER.filter((sec) => sec === activeSection || warm.includes(sec)).map(
                      (sec) => (
                        <Activity key={sec} mode={sec === activeSection ? 'visible' : 'hidden'}>
                          <div className="tab-pane">{renderView(sec)}</div>
                        </Activity>
                      )
                    )}
                  </>
                )}
              </div>
            </main>

            <MobileBottomNav
              activeSection={navSection}
              onSelectSection={handleSelectSection}
              onAdd={() => openAddTransaction({ type: 'expense' })}
            />
          </div>

          <MobileMenuSheet
            open={menuOpen && !isDesktop}
            onClose={() => setMenuOpen(false)}
            totalAssets={totalAssets}
            accountCount={state.accounts.length}
            onSelectSection={handleSelectSection}
            onOpenDataModal={() => setDataModalOpen(true)}
          />

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
            onImportState={(next) => notifySaved(importState(next), 'バックアップデータを復元しました')}
            onResetToSample={() => notifySaved(resetToSampleData(), 'サンプルデータを再読み込みしました')}
            onClearAll={() => notifySaved(clearAllData(), 'すべてのデータを消去しました')}
          />

          <KeyboardAccessory />
          <OfflineIndicator />
          {writeError && <WriteErrorDialog message={writeError} onDismiss={dismissWriteError} />}
          <Toast message={writeError ? null : toastMessage} onDismiss={() => setToastMessage(null)} />
        </div>
      </MotionConfig>
    </AppErrorBoundary>
  );
}
