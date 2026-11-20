import type { FinanceState, Transaction } from '../types/finance';
import { getLedgers, getTransactionLedger } from '../utils/ledgers';
import { isStoredTransaction, requireFinanceState } from './financeState';
import { transactionPositions } from './transactionPositions';

type Binding = string | number | null;
export interface FinanceDatabase {
  exec(sql: string): void;
  run(sql: string, ...bindings: Binding[]): void;
  all<T>(sql: string, ...bindings: Binding[]): T[];
}

const schema = `
  CREATE TABLE IF NOT EXISTS finance_snapshot (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS finance_transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    ledger_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    destination_id TEXT,
    position REAL NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS finance_tx_date ON finance_transactions(date DESC, position);
  CREATE INDEX IF NOT EXISTS finance_tx_ledger ON finance_transactions(ledger_id, date DESC, position);
  CREATE INDEX IF NOT EXISTS finance_tx_source ON finance_transactions(account_id, date DESC, position);
  CREATE INDEX IF NOT EXISTS finance_tx_destination ON finance_transactions(destination_id, date DESC, position);
`;

export const transactionQueries = {
  month: 'SELECT data FROM finance_transactions WHERE date >= ? AND date < ? ORDER BY date DESC, position',
  ledger: 'SELECT data FROM finance_transactions WHERE ledger_id = ? AND date >= ? AND date < ? ORDER BY date DESC, position',
  account: `SELECT data FROM (
    SELECT data, date, position FROM finance_transactions WHERE account_id = ? AND date >= ? AND date < ?
    UNION ALL
    SELECT data, date, position FROM finance_transactions
      WHERE destination_id = ? AND date >= ? AND date < ? AND account_id <> ?
  ) ORDER BY date DESC, position`,
};

type SavedRow = { id: string; date: string; account_id: string; destination_id: string | null; position: number; ledger_id: string; data: string };
type Entry = { transaction: Transaction; position: number; ledgerId: string };
/** One added (prepended), edited in place, or removed transaction. All other rows retain their identity and order. */
export type TransactionChange = { before: FinanceState; id: string };

const corrupt = () => new Error('保存されている家計データを読み取れません。');
const unsupported = () => new Error('このバージョンの家計データを開けません。');

export function createFinanceDatabase(db: FinanceDatabase) {
  function transact<T>(begin: 'BEGIN' | 'BEGIN IMMEDIATE', work: () => T): T {
    db.exec(begin);
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      // SQLite can already have rolled back on an I/O or disk-full error.
      try { db.exec('ROLLBACK'); } catch { /* Preserve the original failure. */ }
      throw error;
    }
  }

  const version = () => db.all<{ user_version: number }>('PRAGMA user_version')[0].user_version;
  const dataVersion = () => db.all<{ data_version: number }>('PRAGMA data_version')[0].data_version;
  if (version() === 0) {
    transact('BEGIN IMMEDIATE', () => {
      if (version() !== 0) return; // Another connection initialized the file.
      if (db.all("SELECT name FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' AND name <> 'android_metadata' LIMIT 1").length) {
        throw unsupported();
      }
      db.exec(schema);
      db.exec('PRAGMA user_version = 1');
    });
  }
  if (version() !== 1) throw unsupported();

  function checkLayout() {
    if (version() !== 1) throw unsupported();
    const tables = {
      finance_snapshot: ['singleton', 'data'],
      finance_transactions: ['id', 'date', 'ledger_id', 'account_id', 'destination_id', 'position', 'data'],
    };
    for (const [name, expected] of Object.entries(tables)) {
      const fields = db.all<{ name: string; pk: number }>(`PRAGMA table_info(${name})`);
      if (fields.length !== expected.length || fields.some((field, i) =>
        field.name !== expected[i] || field.pk !== (i === 0 ? 1 : 0))) throw unsupported();
    }
  }

  let snapshot: FinanceState | null = null;
  let snapshotData: string | undefined;
  let entries = new Map<string, Entry>();
  let observedVersion: number | undefined;
  let readable = false;

  /** Read a consistent snapshot before permitting writes. Migration only starts after a verified empty database. */
  function load(readLegacy?: () => FinanceState | null): FinanceState | null {
    readable = false;
    observedVersion = undefined;
    try {
      const result = transact('BEGIN', () => {
        checkLayout();
        observedVersion = dataVersion();
        const records = db.all<{ singleton: number; data: string }>('SELECT singleton, data FROM finance_snapshot LIMIT 2');
        if (records.length === 0) {
          if (db.all('SELECT 1 FROM finance_transactions LIMIT 1').length) throw corrupt();
          return null;
        }
        if (records.length !== 1 || records[0].singleton !== 1) throw corrupt();
        const metadata = records[0].data;
        const rest = JSON.parse(metadata);
        if (!rest || Array.isArray(rest) || typeof rest !== 'object' || 'transactions' in rest) throw corrupt();
        const rows = db.all<SavedRow>('SELECT id, date, ledger_id, account_id, destination_id, position, data FROM finance_transactions ORDER BY position');
        const transactions = rows.map((row, i) => {
          const tx: Transaction = JSON.parse(row.data);
          if (!isStoredTransaction(tx) || tx.id !== row.id || tx.date !== row.date || tx.accountId !== row.account_id
            || (tx.toAccountId ?? null) !== row.destination_id || !Number.isFinite(row.position)
            || (i > 0 && row.position === rows[i - 1].position)) throw corrupt();
          return tx;
        });
        const state = { ...requireFinanceState({ ...rest, transactions: [] }), transactions };
        const accounts = new Map(state.accounts.map((account) => [account.id, account]));
        const ledgers = getLedgers(state);
        const next = new Map<string, Entry>();
        for (let i = 0; i < rows.length; i++) {
          const transaction = state.transactions[i];
          const row = rows[i];
          if (next.has(row.id) || getTransactionLedger(transaction, accounts, ledgers).id !== row.ledger_id) throw corrupt();
          next.set(row.id, { transaction, position: row.position, ledgerId: row.ledger_id });
        }
        return { state, metadata, next };
      });
      snapshot = result?.state ?? null;
      snapshotData = result?.metadata;
      entries = result?.next ?? new Map();
      readable = true;
      if (snapshot) return snapshot;
      const legacy = readLegacy?.() ?? null;
      if (legacy) {
        try {
          save(legacy);
        } catch (error) {
          if (error instanceof Error && error.name === 'FinanceConflictError') {
            const migrated = load();
            if (migrated) return migrated;
          }
          throw error;
        }
      }
      return legacy;
    } catch (error) {
      readable = false;
      throw error;
    }
  }

  function checkRevision() {
    // data_version changes on commits made by other connections. Check while holding the write lock.
    if (observedVersion === undefined || observedVersion !== dataVersion()) {
      const error = new Error('家計データを再読み込みしてから保存してください。');
      error.name = 'FinanceConflictError';
      throw error;
    }
  }

  function writeEntry(entry: Entry) {
    const { transaction, position, ledgerId } = entry;
    db.run(`INSERT INTO finance_transactions VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET date = excluded.date, ledger_id = excluded.ledger_id,
      account_id = excluded.account_id, destination_id = excluded.destination_id,
      position = excluded.position, data = excluded.data`,
    transaction.id, transaction.date, ledgerId, transaction.accountId, transaction.toAccountId ?? null,
    position, JSON.stringify(transaction));
  }

  function saveOne(state: FinanceState, change: TransactionChange) {
    const previous = entries.get(change.id);
    const delta = state.transactions.length - change.before.transactions.length;
    if (delta === 1 && previous) throw new Error('取引IDが重複しています。');
    if (Math.abs(delta) > 1 || (delta <= 0 && !previous)) throw corrupt();
    let transaction: Transaction | undefined;
    if (delta >= 0) {
      transaction = delta === 1 ? state.transactions[0] : state.transactions.find((row) => row.id === change.id);
      if (!transaction || transaction.id !== change.id || !isStoredTransaction(transaction)) throw corrupt();
    }
    // New transactions are prepended. Existing edits retain their original position.
    const first = change.before.transactions[0];
    const firstPosition = first ? entries.get(first.id)!.position : undefined;
    const position = previous?.position ?? (firstPosition === undefined ? 0 : firstPosition - 1);
    if (!previous && firstPosition !== undefined && position >= firstPosition) {
      // Rebalance when a previous stored position is too large in magnitude to subtract one.
      save(state);
      return;
    }
    const entry = transaction && {
      transaction, position,
      ledgerId: getTransactionLedger(transaction, new Map(state.accounts.map((item) => [item.id, item])), getLedgers(state)).id,
    };
    transact('BEGIN IMMEDIATE', () => {
      checkRevision();
      if (entry) writeEntry(entry);
      else db.run('DELETE FROM finance_transactions WHERE id = ?', change.id);
    });
    if (entry) entries.set(change.id, entry);
    else entries.delete(change.id);
    snapshot = state;
  }

  function save(state: FinanceState, change?: TransactionChange, replace = false) {
    if (!readable && !replace) throw corrupt();
    const { transactions, ...rest } = state;
    const keys = Object.keys(rest) as (keyof typeof rest)[];
    const before = snapshot;
    const sameMetadata = !replace && before !== null && Object.keys(before).length === keys.length + 1
      && keys.every((key) => Object.hasOwn(before, key) && rest[key] === before[key]);
    if (change && change.before === snapshot && sameMetadata) {
      saveOne(state, change);
      return;
    }
    if (!sameMetadata) requireFinanceState({ ...rest, transactions: [] });
    const metadata = sameMetadata ? snapshotData! : JSON.stringify(rest);
    const previousEntries = replace ? new Map<string, Entry>() : entries;
    const sameAssignment = !replace && state.accounts === snapshot?.accounts && state.ledgers === snapshot?.ledgers;
    const next = sameAssignment && transactions === snapshot?.transactions ? previousEntries : new Map<string, Entry>();
    if (next !== previousEntries) {
      const positions = transactionPositions(transactions, previousEntries);
      const accounts = new Map(state.accounts.map((account) => [account.id, account]));
      const ledgers = getLedgers(state);
      for (let i = 0; i < transactions.length; i++) {
        const transaction = transactions[i];
        if (next.has(transaction.id)) throw new Error('取引IDが重複しています。');
        const previous = previousEntries.get(transaction.id);
        if (previous?.transaction !== transaction && !isStoredTransaction(transaction)) throw corrupt();
        const ledgerId = sameAssignment && previous?.transaction === transaction
          ? previous.ledgerId : getTransactionLedger(transaction, accounts, ledgers).id;
        next.set(transaction.id, { transaction, position: positions[i], ledgerId });
      }
    }

    transact('BEGIN IMMEDIATE', () => {
      checkRevision();
      if (replace) {
        checkLayout();
        if (db.all<{ quick_check: string }>('PRAGMA quick_check(1)')[0]?.quick_check !== 'ok') throw corrupt();
        db.run('DELETE FROM finance_transactions');
        db.run('DELETE FROM finance_snapshot');
      }
      if (replace || metadata !== snapshotData) {
        db.run('INSERT INTO finance_snapshot VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET data = excluded.data', metadata);
      }
      if (next !== previousEntries) {
        for (const id of previousEntries.keys()) {
          if (!next.has(id)) db.run('DELETE FROM finance_transactions WHERE id = ?', id);
        }
        for (const [id, entry] of next) {
          const previous = previousEntries.get(id);
          const { transaction, position, ledgerId } = entry;
          if (previous?.transaction === transaction && previous.position === position && previous.ledgerId === ledgerId) continue;
          writeEntry(entry);
        }
      }
    });
    entries = next;
    snapshot = state;
    snapshotData = metadata;
    readable = true;
  }

  const query = (sql: string, ...params: Binding[]) =>
    db.all<{ data: string }>(sql, ...params).map(({ data }) => JSON.parse(data) as Transaction);

  return {
    load,
    save: (state: FinanceState, change?: TransactionChange) => save(state, change),
    replace: (state: FinanceState) => save(state, undefined, true),
    listByDate: (from: string, until: string, ledgerId?: string) => ledgerId === undefined
      ? query(transactionQueries.month, from, until) : query(transactionQueries.ledger, ledgerId, from, until),
    listByAccount: (accountId: string, from: string, until: string) =>
      query(transactionQueries.account, accountId, from, until, accountId, from, until, accountId),
  };
}
