/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createInitialSeedData } from '../data/seedData';
import type { FinanceState, Transaction } from '../types/finance';
import { getAccountLedger, getLedgers } from '../utils/ledgers';
import { computeMonthMetrics } from '../utils/metrics';
import { computeAccountBalances } from './finance';
import { parseFinanceBackup, serializeFinanceBackup } from './financeBackup';
import { createFinanceDatabase, transactionQueries } from './financeDatabase';

const opened: DatabaseSync[] = [];
function setup() {
  const sql = new DatabaseSync(':memory:');
  opened.push(sql);
  const writes: string[] = [];
  const db = createFinanceDatabase({
    exec: (query) => sql.exec(query),
    run: (query, ...params) => { sql.prepare(query).run(...params); writes.push(query); },
    all: <T>(query: string, ...params: (string | number | null)[]) => sql.prepare(query).all(...params) as T[],
  });
  return { sql, db, writes };
}
afterEach(() => {
  for (const sql of opened.splice(0)) sql.close();
});

describe('SQLite finance storage', () => {
  it('preserves legacy amounts, optional data, order and the existing ledger assignments', () => {
    const { db } = setup();
    const before = parseFinanceBackup(JSON.stringify(createInitialSeedData('2026-11')));
    expect(db.load()).toBeNull();
    db.save(before);
    const after = db.load()!;
    expect(after).toEqual(before);
    expect(computeAccountBalances(after)).toEqual(computeAccountBalances(before));
    expect(computeMonthMetrics(after, '2026-11')).toEqual(computeMonthMetrics(before, '2026-11'));
    const account = before.accounts.find((item) => item.type === 'bank')!;
    const ledger = getAccountLedger(account, getLedgers(before));
    const transaction: Transaction = {
      id: 'legacy', type: 'expense', date: '2026-11-10', categoryId: 'food', accountId: account.id, title: 'Legacy', amount: 1,
    };
    db.save({ ...after, transactions: [transaction, ...after.transactions] });
    expect(db.listByDate('2026-11-01', '2026-12-01', ledger.id)).toContainEqual(transaction);
  });

  it('writes one new or edited row, retains same-day order and includes a transfer once per account', () => {
    const { db, writes } = setup();
    const before = createInitialSeedData('2026-11');
    db.save(before);
    const original = before.transactions.find((item) => item.type === 'transfer' && item.date.startsWith('2026-11'))!;
    const extra = { ...original, id: 'new-transfer' };
    const next = { ...before, transactions: [extra, ...before.transactions] };
    writes.length = 0;
    db.save(next);
    expect(writes).toHaveLength(1);
    expect(db.load()?.transactions[0]).toEqual(extra);
    expect(db.listByDate('2026-11-01', '2026-12-01').filter((item) => item.date === extra.date)[0]).toEqual(extra);
    for (const account of [extra.accountId, extra.toAccountId!]) {
      expect(db.listByAccount(account, '2026-11-01', '2026-12-01').filter((item) => item.id === extra.id)).toHaveLength(1);
    }
    const persisted = db.load()!;
    writes.length = 0;
    db.save({ ...persisted, transactions: [{ ...persisted.transactions[0], title: 'updated' }, ...persisted.transactions.slice(1)] });
    expect(writes).toHaveLength(1);
  });

  it('rolls back both metadata and rows if a write fails', () => {
    const { db, sql } = setup();
    const before = createInitialSeedData('2026-11');
    db.save(before);
    sql.exec("CREATE TRIGGER prevent_insert BEFORE INSERT ON finance_transactions WHEN NEW.id = 'bad' BEGIN SELECT RAISE(ABORT, 'test write failure'); END");
    const rejected: FinanceState = {
      ...before, accounts: before.accounts.slice(1), transactions: [{ ...before.transactions[0], id: 'bad' }],
    };
    expect(() => db.save(rejected)).toThrow('test write failure');
    expect(db.load()).toEqual(before);
  });

  it('uses the date, ledger and both transfer-side indexes', () => {
    const { sql } = setup();
    const from = '2026-11-01';
    const until = '2026-12-01';
    const explain = (query: string, ...params: string[]) =>
      sql.prepare('EXPLAIN QUERY PLAN ' + query).all(...params).map((row) => row.detail).join('\n');
    expect(explain(transactionQueries.month, from, until)).toContain('finance_tx_date');
    expect(explain(transactionQueries.ledger, 'personal', from, until)).toContain('finance_tx_ledger');
    const account = explain(transactionQueries.account, 'a', from, until, 'a', from, until, 'a');
    expect(account).toContain('finance_tx_source');
    expect(account).toContain('finance_tx_destination');
  });
});

describe('full finance backup', () => {
  it('round-trips a versioned backup and opens an older raw export', () => {
    const original = createInitialSeedData('2026-11');
    expect(parseFinanceBackup(serializeFinanceBackup(original))).toEqual(parseFinanceBackup(JSON.stringify(original)));
  });

  it('rejects unknown formats or a broken/duplicated transaction rather than dropping data', () => {
    const original = createInitialSeedData('2026-11');
    expect(() => parseFinanceBackup('{"format":"dmm-finance-backup","version":2}')).toThrow();
    for (const entry of [{ id: 'incomplete' }, original.transactions[0]]) {
      expect(() => parseFinanceBackup(JSON.stringify({ ...original, transactions: [...original.transactions, entry] }))).toThrow();
    }
  });
});
