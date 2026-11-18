import type { Account, FinanceState, Ledger, Transaction } from '../types/finance';

const DEFAULT_LEDGERS: readonly Ledger[] = [
  { id: 'personal', name: '個人', kind: 'personal' },
  { id: 'household', name: '家庭', kind: 'household' },
  { id: 'business', name: '事業', kind: 'business' },
];

export function getLedgers(state: FinanceState): readonly Ledger[] {
  return state.ledgers?.length ? state.ledgers : DEFAULT_LEDGERS;
}

export function getLedgerTaxExemption(ledger: Ledger, year: number): { amount: number; sourceYear?: number } {
  let amount = 0;
  let sourceYear: number | undefined;
  for (const [key, value] of Object.entries(ledger.taxExemptions ?? {})) {
    const candidateYear = Number(key);
    if (!/^\d{4}$/.test(key) || candidateYear > year || (sourceYear !== undefined && candidateYear <= sourceYear)) continue;
    if (value === undefined || !Number.isSafeInteger(value) || value < 0) continue;
    sourceYear = candidateYear;
    amount = value;
  }
  return { amount, sourceYear };
}

export function getAccountLedger(account: Account, ledgers: readonly Ledger[]): Ledger {
  return ledgers.find((ledger) => ledger.id === account.ledgerId) ??
    ledgers.find((ledger) => ledger.kind === (account.usageScope ?? 'personal')) ?? ledgers[0];
}

export function getTransactionLedger(
  transaction: Pick<Transaction, 'ledgerId' | 'scope' | 'accountId'>,
  accounts: ReadonlyMap<string, Account>,
  ledgers: readonly Ledger[]
): Ledger {
  const explicit = ledgers.find((ledger) => ledger.id === transaction.ledgerId);
  if (explicit) return explicit;
  const account = accounts.get(transaction.accountId);
  const ledger = account ? getAccountLedger(account, ledgers) : undefined;
  if (transaction.scope === 'business' && ledger?.kind !== 'business') {
    return ledgers.find((group) => group.kind === 'business') ?? ledger ?? ledgers[0];
  }
  return ledger ?? ledgers.find((group) => group.kind === 'personal') ?? ledgers[0];
}

export function filterLedger(state: FinanceState, id: string | null): FinanceState {
  if (id === null) return state;
  const ledgers = getLedgers(state);
  const accounts = new Map(state.accounts.map((account) => [account.id, account]));
  return {
    ...state,
    accounts: state.accounts.filter((account) => getAccountLedger(account, ledgers).id === id),
    transactions: state.transactions.filter((tx) => getTransactionLedger(tx, accounts, ledgers).id === id),
  };
}

/** Retain the assignment of every item when moving balances and history out of a group. */
export function removeLedger(state: FinanceState, id: string, destinationId: string): FinanceState {
  const ledgers = getLedgers(state);
  const remaining = ledgers.filter((ledger) => ledger.id !== id);
  if (remaining.length === ledgers.length || !remaining.some((ledger) => ledger.id === destinationId)) {
    return state;
  }
  const accounts = new Map(state.accounts.map((account) => [account.id, account]));
  const move = (ledger: Ledger) => ledger.id === id ? destinationId : ledger.id;
  return {
    ...state,
    ledgers: remaining,
    accounts: state.accounts.map((account) => ({ ...account, ledgerId: move(getAccountLedger(account, ledgers)) })),
    transactions: state.transactions.map((transaction) => ({
      ...transaction,
      ledgerId: move(getTransactionLedger(transaction, accounts, ledgers)),
    })),
  };
}
