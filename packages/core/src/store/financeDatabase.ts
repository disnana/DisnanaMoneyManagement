import type { FinanceState, Transaction } from '../types/finance';
import { getLedgers, getTransactionLedger } from '../utils/ledgers';

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

type SavedRow = { id: string; position: number; ledger_id: string; data: string };
type Entry = { transaction: Transaction; position: number; ledgerId: string };
type RestOfState = Omit<FinanceState, 'transactions'>;

export function createFinanceDatabase(db: FinanceDatabase) {
  const version = db.all<{ user_version: number }>('PRAGMA user_version')[0].user_version;
  if (version !== 0 && version !== 1) throw new Error('このバージョンの家計データを開けません。');
  if (version === 0) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(schema);
      db.exec('PRAGMA user_version = 1');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  let snapshot: FinanceState | undefined;
  let snapshotData: string | undefined;
  let entries = new Map<string, Entry>();

  function load(): FinanceState | null {
    const metadata = db.all<{ data: string }>('SELECT data FROM finance_snapshot WHERE singleton = 1')[0];
    if (!metadata) return null;
    const rows = db.all<SavedRow>('SELECT id, position, ledger_id, data FROM finance_transactions ORDER BY position');
    const transactions = rows.map(({ data }) => JSON.parse(data) as Transaction);
    entries = new Map(rows.map((row, index) => [
      row.id, { transaction: transactions[index], position: row.position, ledgerId: row.ledger_id },
    ]));
    snapshotData = metadata.data;
    snapshot = { ...JSON.parse(metadata.data) as RestOfState, transactions };
    return snapshot;
  }

  function save(state: FinanceState) {
    if (state === snapshot) return;
    const { transactions, ...rest } = state;
    const metadata = JSON.stringify(rest);
    const sameTransactions = transactions === snapshot?.transactions;
    const sameAssignment = state.accounts === snapshot?.accounts && state.ledgers === snapshot?.ledgers;
    const next = sameTransactions && sameAssignment ? entries : new Map<string, Entry>();
    if (next !== entries) {
      const positions = transactionPositions(transactions, entries);
      const accounts = new Map(state.accounts.map((account) => [account.id, account]));
      const ledgers = getLedgers(state);
      for (let i = 0; i < transactions.length; i++) {
        const transaction = transactions[i];
        if (next.has(transaction.id)) throw new Error('取引IDが重複しています。');
        const previous = entries.get(transaction.id);
        const ledgerId = sameAssignment && previous?.transaction === transaction
          ? previous.ledgerId : getTransactionLedger(transaction, accounts, ledgers).id;
        next.set(transaction.id, { transaction, position: positions[i], ledgerId });
      }
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      if (metadata !== snapshotData) {
        db.run('INSERT INTO finance_snapshot VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET data = excluded.data', metadata);
      }
      if (next !== entries) {
        for (const [id] of entries) {
          if (!next.has(id)) db.run('DELETE FROM finance_transactions WHERE id = ?', id);
        }
        for (const [id, entry] of next) {
          const previous = entries.get(id);
          const { transaction, position, ledgerId } = entry;
          if (previous?.transaction === transaction && previous.position === position && previous.ledgerId === ledgerId) continue;
          db.run(`INSERT INTO finance_transactions VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET date = excluded.date, ledger_id = excluded.ledger_id,
            account_id = excluded.account_id, destination_id = excluded.destination_id,
            position = excluded.position, data = excluded.data`,
          id, transaction.date, ledgerId, transaction.accountId, transaction.toAccountId ?? null, position, JSON.stringify(transaction));
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    entries = next;
    snapshot = state;
    snapshotData = metadata;
  }

  const query = (sql: string, ...params: Binding[]) =>
    db.all<{ data: string }>(sql, ...params).map(({ data }) => JSON.parse(data) as Transaction);

  return {
    load, save,
    listByDate: (from: string, until: string, ledgerId?: string) => ledgerId === undefined
      ? query(transactionQueries.month, from, until) : query(transactionQueries.ledger, ledgerId, from, until),
    listByAccount: (accountId: string, from: string, until: string) =>
      query(transactionQueries.account, accountId, from, until, accountId, from, until, accountId),
  };
}

/** Preserve stored order without rewriting existing positions when recording or deleting a transaction. */
function transactionPositions(transactions: readonly Transaction[], entries: ReadonlyMap<string, Entry>): number[] {
  const positions: number[] = [];
  let left = -Infinity;
  let start = 0;
  for (let i = 0; i <= transactions.length; i++) {
    const right = i === transactions.length ? Infinity : entries.get(transactions[i].id)?.position;
    if (right === undefined) continue;
    if (right <= left) return transactions.map((_, index) => index);
    const count = i - start;
    for (let offset = 0; offset < count; offset++) {
      const position = left === -Infinity ? (right === Infinity ? offset : right - count + offset)
        : right === Infinity ? left + offset + 1 : left + ((right - left) * (offset + 1)) / (count + 1);
      if (position >= right || position <= (positions.at(-1) ?? -Infinity)) {
        return transactions.map((_, index) => index);
      }
      positions.push(position);
    }
    if (right !== Infinity) positions.push(right);
    left = right;
    start = i + 1;
  }
  return positions;
}
