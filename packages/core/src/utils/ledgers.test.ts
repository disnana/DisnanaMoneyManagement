import { describe, expect, it } from 'vitest';
import type { FinanceState } from '../types/finance';
import { computeAccountBalances, loadInitialState, STORAGE_KEY } from '../store/finance';
import { filterLedger, getLedgers, getLedgerTaxExemption, getOrderedLedgers, removeLedger } from './ledgers';
import { computeTaxSummary } from './tax';

const savedState: FinanceState = {
  accounts: [{ id: 'bank', name: '銀行', type: 'bank', usageScope: 'household', initialBalance: 10000 }],
  transactions: [
    { id: 'groceries', type: 'expense', title: '食費', categoryId: 'food', accountId: 'bank', date: '2026-11-01', amount: 1000 },
    {
      id: 'equipment', type: 'expense', title: '備品', categoryId: 'office', accountId: 'bank', date: '2026-11-03',
      amount: 2000, scope: 'business', businessRatio: 50,
    },
  ],
  budgets: [],
  savingsGoals: [],
  recurringItems: [],
};

describe('finance groups', () => {
  it('uses account and business scope for legacy records without changing the actual balances', () => {
    expect(getLedgers(savedState).map((ledger) => ledger.id)).toEqual(['personal', 'household', 'business']);
    expect(filterLedger(savedState, 'household').transactions.map((tx) => tx.id)).toEqual(['groceries']);
    const business = filterLedger(savedState, 'business');
    expect(business.accounts).toEqual([]);
    expect(computeTaxSummary(business.transactions).totalDeductibleExpense).toBe(1000);
    expect(computeAccountBalances(savedState)).toEqual({ bank: 7000 });
  });

  it('reloads the display order without changing how older records are assigned', () => {
    const state: FinanceState = {
      ...savedState,
      ledgers: [{ id: 'second_home', name: '家庭用2', kind: 'household' }, ...getLedgers(savedState)],
      ledgerOrder: ['household', 'missing', 'business', 'second_home'],
    };
    const loaded = loadInitialState({ getItem: (key) => key === STORAGE_KEY ? JSON.stringify(state) : null });
    expect(getOrderedLedgers(loaded).map((ledger) => ledger.id)).toEqual(['household', 'business', 'second_home', 'personal']);
    expect(filterLedger(loaded, 'second_home').transactions.map((tx) => tx.id)).toEqual(['groceries']);
    expect(filterLedger(loaded, 'household').transactions).toEqual([]);
  });

  it('moves saved records to a selected group when deleting a group and retains their tax fields on reload', () => {
    const state = removeLedger(savedState, 'business', 'personal');
    const loaded = loadInitialState({ getItem: (key) => key === STORAGE_KEY ? JSON.stringify(state) : null });
    expect(getLedgers(loaded).map((ledger) => ledger.id)).toEqual(['personal', 'household']);
    expect(filterLedger(loaded, 'personal').transactions).toMatchObject([
      { id: 'equipment', ledgerId: 'personal', scope: 'business', businessRatio: 50 },
    ]);
    expect(filterLedger(loaded, 'household').transactions.map((tx) => tx.id)).toEqual(['groceries']);
    expect(computeAccountBalances(loaded)).toEqual(computeAccountBalances(savedState));
  });

  it('inherits the latest year per group and keeps an explicit zero override', () => {
    const personal = { ...getLedgers(savedState)[0], taxExemptions: { 2024: 300000, 2027: 0 } };
    expect(getLedgerTaxExemption(personal, 2023).amount).toBe(0);
    expect(getLedgerTaxExemption(personal, 2026)).toEqual({ amount: 300000, sourceYear: 2024 });
    expect(getLedgerTaxExemption(personal, 2027)).toEqual({ amount: 0, sourceYear: 2027 });
    expect(getLedgerTaxExemption(personal, 2028)).toEqual({ amount: 0, sourceYear: 2027 });
    expect(getLedgerTaxExemption(getLedgers(savedState)[1], 2026).amount).toBe(0);
  });
});
