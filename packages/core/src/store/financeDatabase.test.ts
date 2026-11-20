/// <reference types="node" />
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialSeedData } from '../data/seedData';
import { computeMonthMetrics } from '../utils/metrics';
import { computeAccountBalances, readLegacyFinanceState, requireFinanceState, STORAGE_KEY } from './finance';
import { createFinanceDatabase, transactionQueries } from './financeDatabase';

const connections: DatabaseSync[] = [];
const directories: string[] = [];
function setup(path = ':memory:') {
  const sql = new DatabaseSync(path);
  connections.push(sql);
  const writes: string[] = [];
  const db = createFinanceDatabase({
    exec: (query) => sql.exec(query),
    run: (query, ...params) => { sql.prepare(query).run(...params); writes.push(query); },
    all: <T>(query: string, ...params: (string | number | null)[]) => sql.prepare(query).all(...params) as T[],
  });
  return { sql, db, writes };
}

const sample = () => requireFinanceState(createInitialSeedData('2026-11'));
const filePath = () => {
  const directory = mkdtempSync(join(tmpdir(), 'dmm-finance-'));
  directories.push(directory);
  return join(directory, 'finance.db');
};

afterEach(() => {
  for (const sql of connections.splice(0)) sql.close();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('native SQLite finance storage', () => {
  it('migrates the older save once, preserving balances, ledger assignments and transaction order', () => {
    const { db } = setup();
    const state = sample();
    const source = JSON.stringify(state);
    const read = vi.fn(() => readLegacyFinanceState({ getItem: key => key.endsWith('v2') ? source : null }));
    const migrated = db.load(read)!;
    expect(migrated).toEqual(state);
    expect(db.load(read)).toEqual(migrated);
    expect(read).toHaveBeenCalledTimes(1);
    expect(computeAccountBalances(migrated)).toEqual(computeAccountBalances(state));
    expect(computeMonthMetrics(migrated, '2026-11')).toEqual(computeMonthMetrics(state, '2026-11'));
    const legacy = { ...migrated.transactions[0], id: 'legacy-ledger', ledgerId: undefined, scope: 'business' as const };
    db.save({ ...migrated, transactions: [legacy, ...migrated.transactions] });
    expect(db.listByDate('2026-11-01', '2026-12-01', 'business').map(tx => tx.id)).toContain(legacy.id);
  });

  it('opens previously written schema-1 rows, including accounts without a usageScope', () => {
    const path = filePath();
    const { sql } = setup(path);
    sql.prepare('INSERT INTO finance_snapshot VALUES (1, ?)').run(JSON.stringify({
      accounts: [{ id: 'cash', name: '旧財布', type: 'cash', initialBalance: 100 }], budgets: [], recurringItems: [], savingsGoals: [],
    }));
    const transaction = { id: 'old', type: 'expense', amount: 15, title: '旧取引', accountId: 'cash', categoryId: 'food', date: '2020-02-29' };
    sql.prepare('INSERT INTO finance_transactions VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      transaction.id, transaction.date, 'personal', transaction.accountId, null, -3, JSON.stringify(transaction),
    );
    const loaded = setup(path).db.load()!;
    expect(loaded.accounts).toMatchObject([{ id: 'cash', usageScope: 'personal' }]);
    expect(loaded.transactions).toEqual([transaction]);
    expect(computeAccountBalances(loaded)).toEqual({ cash: 85 });
  });

  it('accepts an intentional empty account list after erasing the last account', () => {
    const { db } = setup();
    const state = { ...sample(), accounts: [] };
    db.load();
    db.save(state);
    expect(db.load()?.accounts).toEqual([]);
  });

  it('leaves both stores untouched after a bad legacy read or a migration write failure and can retry', () => {
    const { db, sql } = setup();
    const original = sample();
    const valid = JSON.stringify(original);
    const keys = new Map([[STORAGE_KEY, '{invalid'], ['kakeibo_finance_state_v1', valid]]);
    const read = () => readLegacyFinanceState({ getItem: k => keys.get(k) ?? null });
    expect(() => db.load(read)).toThrow();
    expect(() => db.save(original)).toThrow();
    expect(keys.get(STORAGE_KEY)).toBe('{invalid');
    keys.set(STORAGE_KEY, valid);
    sql.exec("CREATE TRIGGER full_disk BEFORE INSERT ON finance_transactions BEGIN SELECT RAISE(ABORT, 'full'); END");
    expect(() => db.load(read)).toThrow('full');
    expect(sql.prepare('SELECT count(*) AS n FROM finance_snapshot').get()?.n).toBe(0);
    expect(sql.prepare('SELECT count(*) AS n FROM finance_transactions').get()?.n).toBe(0);
    expect(() => db.save(original)).toThrow();
    expect(keys.get(STORAGE_KEY)).toBe(valid);
    sql.exec('DROP TRIGGER full_disk');
    expect(db.load(read)).toEqual(original);
  });

  it('adopts another connection’s completed migration if it wins the first write', () => {
    const path = filePath();
    const a = setup(path).db;
    const b = setup(path).db;
    const legacy = sample();
    const winner = { ...legacy, budgets: [] };
    expect(a.load(() => {
      b.load();
      b.save(winner);
      return legacy;
    })).toEqual(winner);
    expect(a.load()).toEqual(winner);
  });

  it('writes just the changed row for add, edit and delete, preserving same-day order and both sides of a transfer', () => {
    const { db, writes } = setup();
    const before = sample();
    db.load();
    db.save(before);
    const original = before.transactions.find((tx) => tx.type === 'transfer' && tx.date.startsWith('2026-11'))!;
    const added = { ...original, id: 'new-transfer' };
    const next = { ...before, transactions: [added, ...before.transactions] };
    writes.length = 0;
    db.save(next, { before, id: added.id });
    expect(writes).toHaveLength(1);
    expect(db.listByDate('2026-11-01', '2026-12-01').filter((item) => item.date === added.date)[0]).toEqual(added);
    for (const account of [added.accountId, added.toAccountId!]) {
      expect(db.listByAccount(account, '2026-11-01', '2026-12-01').filter((item) => item.id === added.id)).toHaveLength(1);
    }
    const edited = { ...next, transactions: next.transactions.map(tx => tx === added ? { ...tx, amount: 42 } : tx) };
    db.save(edited, { before: next, id: added.id });
    expect(writes).toHaveLength(2);
    expect(db.listByDate('2026-11-01', '2026-12-01').find(tx => tx.id === added.id)?.amount).toBe(42);
    db.save(before, { before: edited, id: added.id });
    expect(writes).toHaveLength(3);
    expect(db.load()).toEqual(before);
  });

  it('rebalances a prepend when the previous first position cannot be decremented', () => {
    const { db, sql } = setup();
    const before = sample();
    db.load();
    db.save(before);
    sql.prepare('UPDATE finance_transactions SET position = ? WHERE id = ?').run(-1e18, before.transactions[0].id);
    const persisted = db.load()!;
    const first = { ...persisted.transactions[0], id: 'new-first' };
    const next = { ...persisted, transactions: [first, ...persisted.transactions] };
    db.save(next, { before: persisted, id: first.id });
    expect(db.load()).toEqual(next);
  });

  it('retains the previous cached row on a failed single-record edit, and commits only the retry', () => {
    const { db, sql } = setup();
    const before = sample();
    db.load();
    db.save(before);
    const [record, ...remaining] = before.transactions;
    const next = { ...before, transactions: [{ ...record, title: 'retry' }, ...remaining] };
    sql.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON finance_transactions BEGIN SELECT RAISE(ABORT, 'full'); END");
    expect(() => db.save(next, { before, id: record.id })).toThrow('full');
    expect(JSON.parse(sql.prepare('SELECT data FROM finance_transactions WHERE id = ?').get(record.id)!.data as string).title)
      .toBe(record.title);
    sql.exec('DROP TRIGGER fail_update');
    db.save(next, { before, id: record.id });
    expect(db.load()).toEqual(next);
  });

  it('rejects invalid metadata before overwriting a readable ledger', () => {
    const { db } = setup();
    const before = sample();
    db.load();
    db.save(before);
    const invalid = { ...before, accounts: before.accounts.map(account => ({ ...account, initialBalance: NaN })) };
    expect(() => db.save(invalid)).toThrow();
    expect(() => db.replace(invalid)).toThrow();
    expect(db.load()).toEqual(before);
  });

  it('rolls back a failed compound write and retries from the committed snapshot', () => {
    const path = filePath();
    const { db, sql } = setup(path);
    const before = sample();
    db.load();
    db.save(before);
    const changed = {
      ...before,
      accounts: before.accounts.slice(1),
      transactions: [{ ...before.transactions[0], id: 'first' }, { ...before.transactions[1], id: 'bad' }],
    };
    sql.exec("CREATE TRIGGER fail_second BEFORE INSERT ON finance_transactions WHEN NEW.id = 'bad' BEGIN SELECT RAISE(ABORT, 'disk full'); END");
    expect(() => db.save(changed)).toThrow('disk full');
    expect(setup(path).db.load()).toEqual(before);
    sql.exec('DROP TRIGGER fail_second');
    db.save(changed);
    expect(setup(path).db.load()).toEqual(changed);
  });

  it('rejects a stale writer on a second connection and can reconcile after reload', () => {
    const path = filePath();
    const a = setup(path).db;
    const b = setup(path).db;
    const original = sample();
    a.load();
    b.load();
    a.save(original);
    expect(() => b.save(original)).toThrowError(expect.objectContaining({ name: 'FinanceConflictError' }));
    const prior = b.load()!;
    const item = original.transactions[0];
    const updated = { ...original, transactions: [{ ...item, amount: 8 }, ...original.transactions.slice(1)] };
    a.save(updated, { before: original, id: item.id });
    expect(() => b.save({ ...prior, budgets: [] })).toThrowError(expect.objectContaining({ name: 'FinanceConflictError' }));
    expect(() => b.replace(prior)).toThrowError(expect.objectContaining({ name: 'FinanceConflictError' }));
    const fresh = b.load()!;
    b.save({ ...fresh, budgets: [] });
    expect(a.load()).toEqual({ ...updated, budgets: [] });
  });

  it.each([
    ['missing snapshot', 'DELETE FROM finance_snapshot'],
    ['malformed metadata', "UPDATE finance_snapshot SET data = '{'"],
    ['missing collections', "UPDATE finance_snapshot SET data = '{}'"],
    ['malformed account amount', "UPDATE finance_snapshot SET data = json_set(data, '$.accounts[0].initialBalance', 'broken')"],
    ['duplicate account ID', "UPDATE finance_snapshot SET data = json_set(data, '$.accounts[0].id', json_extract(data, '$.accounts[1].id'))"],
    ['nested transaction data', "UPDATE finance_snapshot SET data = json_set(data, '$.transactions', json_array())"],
    ['malformed transaction', "UPDATE finance_transactions SET data = 'null'"],
    ['bad amount', "UPDATE finance_transactions SET data = json_set(data, '$.amount', 'xyz')"],
    ['mismatched IDs', "UPDATE finance_transactions SET data = json_set(data, '$.id', 'unexpected')"],
    ['duplicate position', 'UPDATE finance_transactions SET position = 0'],
    ['inconsistent source index', "UPDATE finance_transactions SET account_id = 'wrong'"],
    ['inconsistent ledger index', "UPDATE finance_transactions SET ledger_id = 'wrong'"],
  ])('protects a damaged ledger (%s) until explicit atomic recovery succeeds', (_label, damage) => {
    const { db, sql } = setup();
    const state = sample();
    db.load();
    db.save(state);
    sql.exec(damage);
    const contents = () => [
      sql.prepare('SELECT * FROM finance_snapshot').all(),
      sql.prepare('SELECT * FROM finance_transactions').all(),
    ];
    const damaged = contents();
    const older = vi.fn(() => state);
    expect(() => db.load(older)).toThrow();
    expect(older).not.toHaveBeenCalled();
    expect(() => db.save(state)).toThrow();
    sql.exec("CREATE TRIGGER fail_restore BEFORE INSERT ON finance_transactions BEGIN SELECT RAISE(ABORT, 'full'); END");
    expect(() => db.replace(state)).toThrow('full');
    expect(contents()).toEqual(damaged);
    sql.exec('DROP TRIGGER fail_restore');
    db.replace(state);
    expect(db.load()).toEqual(state);
  });

  it('does not replace data when the schema is unknown or structurally damaged', () => {
    const { db, sql } = setup();
    const state = sample();
    db.load();
    db.save(state);
    sql.exec('PRAGMA user_version = 2');
    expect(() => db.load()).toThrow('このバージョン');
    expect(() => db.replace(state)).toThrow();
    expect(sql.prepare('SELECT count(*) AS n FROM finance_transactions').get()?.n).toBe(state.transactions.length);
    sql.exec('PRAGMA user_version = 1; ALTER TABLE finance_transactions RENAME COLUMN data TO original');
    expect(() => db.load()).toThrow();
    expect(() => db.replace(state)).toThrow();
    expect(sql.prepare('SELECT count(*) AS n FROM finance_transactions').get()?.n).toBe(state.transactions.length);
  });

  it('refuses to initialize a nonempty file with missing schema version', () => {
    const path = filePath();
    const { sql } = setup(path);
    sql.exec('PRAGMA user_version = 0');
    expect(() => setup(path)).toThrow('このバージョン');
    expect(sql.prepare('PRAGMA user_version').get()?.user_version).toBe(0);
  });

  it('uses date, ledger and both transfer-side indexes', () => {
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
