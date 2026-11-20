/// <reference lib="dom" />
import type { FinanceState, Transaction } from '../types/finance';
import type { FinanceStorage } from './finance';
import { isStoredTransaction, legacyFinanceKeys, readLegacyFinanceState, requireFinanceState } from './financeState';
import type { TransactionChange } from './financeDatabase';
import { transactionPositions } from './transactionPositions';

const stores = ['state', 'transactions'];
type Metadata = Omit<FinanceState, 'transactions'>;
type Row = { position: number; data: Transaction };
type Head = { revision: string; count: number };
const damagedRevision = Symbol('damaged revision');
function readRevision(head?: Head): string | null | typeof damagedRevision {
  if (head === undefined) return null;
  return typeof head?.revision === 'string' && head.revision.length ? head.revision : damagedRevision;
}
type Snapshot = { state: FinanceState | null; rows: Map<string, Row> };

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function inTransaction<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>) {
  const tx = db.transaction(stores, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('データベースの処理が中断されました。'));
  });
  try {
    const [value] = await Promise.all([work(tx), done]);
    return value;
  } catch (error) {
    try { tx.abort(); } catch { /* The operation may already have aborted. */ }
    await done.catch(() => {});
    throw error;
  }
}

function conflict() {
  const error = new Error('別のタブで家計データが更新されました。最新の内容を確認してから、もう一度お試しください。');
  error.name = 'FinanceConflictError';
  return error;
}

function metadataChanged(state: Metadata, before: FinanceState | null): boolean {
  if (!before) return true;
  const { transactions: _transactions, ...previous } = before;
  const keys = Object.keys(state) as (keyof Metadata)[];
  return keys.length !== Object.keys(previous).length || keys.some(key => !Object.hasOwn(previous, key) || state[key] !== previous[key]);
}

/** Preserve existing rows and dates' tie order for batch expenses, imports, and reimbursements. */
function writeRows(store: IDBObjectStore, transactions: Transaction[], previous: Snapshot | undefined): Map<string, Row> {
  const oldRows = previous?.rows ?? new Map<string, Row>();
  const positions = transactionPositions(transactions, oldRows);
  const next = new Map<string, Row>();
  let rebuild = !previous;
  transactions.forEach((data, index) => {
    if (next.has(data.id)) throw new Error('取引IDが重複しています。');
    const old = oldRows.get(data.id);
    if (old?.data !== data && !isStoredTransaction(data)) throw new Error('保存する取引の内容を確認してください。');
    const position = positions[index];
    // Swaps could transiently violate the unique position index. Rebuild atomically in that case.
    if (old && old.position !== position) rebuild = true;
    next.set(data.id, old?.data === data && old.position === position ? old : { data, position });
  });
  if (rebuild) {
    store.clear();
  } else {
    for (const id of oldRows.keys()) if (!next.has(id)) store.delete(id);
  }
  for (const [id, row] of next) {
    if (rebuild || row !== oldRows.get(id)) store.put(row);
  }
  return next;
}

/** Browser-only storage. The legacy JSON remains available after the first successful migration. */
export function createBrowserFinanceStorage(): FinanceStorage {
  let connection: Promise<IDBDatabase> | undefined;
  let snapshot: Snapshot | undefined;
  // undefined until a supported store has actually been read. null denotes a store with no head yet.
  let revision: ReturnType<typeof readRevision> | undefined;

  function open(): Promise<IDBDatabase> {
    if (connection) return connection;
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('dmm-finance', 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('state');
        db.createObjectStore('transactions', { keyPath: 'data.id' }).createIndex('position', 'position', { unique: true });
      };
      request.onblocked = () => {
        blocked = true;
        reject(new Error('家計データを開くため、ほかのタブを閉じてから再試行してください。'));
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => {
          db.close();
          connection = undefined;
          revision = undefined;
          snapshot = undefined;
        };
        db.onclose = () => { connection = undefined; };
        resolve(db);
      };
    }).catch(error => { connection = undefined; throw error; });
    return connection;
  }

  async function write(state: FinanceState, previous: Snapshot | undefined, change?: TransactionChange) {
    const expected = revision;
    if (expected === undefined) throw new Error('保存済みの家計データを読み直してください。');
    if (change && change.before !== previous?.state) throw conflict();
    const db = await open();
    const nextRevision = crypto.getRandomValues(new Uint32Array(4)).join('-');
    const { transactions, ...metadata } = state;
    const before = previous?.state ?? null;
    const entries = previous?.rows ?? new Map<string, Row>();
    let nextRows = entries;
    let changedRow: Row | undefined;
    let removedId: string | undefined;
    await inTransaction(db, 'readwrite', async tx => {
      const settings = tx.objectStore('state');
      const rows = tx.objectStore('transactions');
      const head: Head | undefined = await result(settings.get('head'));
      if (readRevision(head) !== expected) throw conflict();

      if (change && before) {
        const oldPosition = entries.get(change.id)?.position;
        const delta = transactions.length - before.transactions.length;
        if (delta === 1) {
          const added = transactions[0];
          if (oldPosition !== undefined || added.id !== change.id || !isStoredTransaction(added)) {
            throw new Error('追加する取引の内容を確認してください。');
          }
          const first = before.transactions[0];
          const firstPosition = first ? entries.get(first.id)!.position : 1;
          const position = firstPosition - 1;
          if (position < firstPosition && Number.isFinite(position)) {
            changedRow = { data: added, position };
            rows.add(changedRow);
          } else {
            nextRows = writeRows(rows, transactions, previous);
          }
        } else if (delta === -1 && oldPosition !== undefined) {
          removedId = change.id;
          rows.delete(change.id);
        } else if (delta === 0 && oldPosition !== undefined) {
          const edited = transactions.find(item => item.id === change.id);
          if (!edited || !isStoredTransaction(edited)) throw new Error('変更する取引の内容を確認してください。');
          changedRow = { data: edited, position: oldPosition };
          rows.put(changedRow);
        } else {
          throw new Error('変更する取引が見つかりません。');
        }
      } else if (transactions !== before?.transactions) {
        nextRows = writeRows(rows, transactions, previous);
      }
      if (metadataChanged(metadata, before)) {
        requireFinanceState({ ...metadata, transactions: [] });
        settings.put(metadata, 'metadata');
      }
      settings.put({ revision: nextRevision, count: transactions.length } satisfies Head, 'head');
    });
    if (changedRow) nextRows.set(changedRow.data.id, changedRow);
    if (removedId !== undefined) nextRows.delete(removedId);
    snapshot = { state, rows: nextRows };
    revision = nextRevision;
  }

  async function loadState(): Promise<FinanceState | null> {
    snapshot = undefined;
    revision = undefined;
    const db = await open();
    const [head, metadata, stateKeys, ordered, count] = await inTransaction(db, 'readonly', tx => {
      const settings = tx.objectStore('state');
      const rows = tx.objectStore('transactions');
      const order = rows.index('position');
      if (db.objectStoreNames.length !== stores.length || settings.keyPath !== null || settings.autoIncrement ||
          rows.keyPath !== 'data.id' || rows.autoIncrement || order.keyPath !== 'position' || !order.unique) {
        throw new Error('この家計データの保存形式には対応していません。');
      }
      return Promise.all([
        result<Head | undefined>(settings.get('head')),
        result<Metadata | undefined>(settings.get('metadata')),
        result(settings.count()),
        result<Row[]>(order.getAll()),
        result(rows.count()),
      ]);
    });

    if (stateKeys !== Number(head !== undefined) + Number(metadata !== undefined)) {
      throw new Error('この家計データの保存形式には対応していません。');
    }
    revision = readRevision(head);
    if (stateKeys === 0 && count === 0) {
      const legacy = readLegacyFinanceState(localStorage);
      if (legacy) {
        try { await write(legacy, undefined); }
        catch (error) {
          // Another tab may have completed the same migration after our initial read.
          if (error instanceof Error && error.name === 'FinanceConflictError') return loadState();
          throw error;
        }
      } else {
        snapshot = { state: null, rows: new Map() };
      }
      return legacy;
    }

    if (!head || revision === damagedRevision || !metadata || head.count !== count || ordered.length !== count ||
        ordered.some(row => !Number.isFinite(row.position) || !isStoredTransaction(row.data))) {
      throw new Error('家計データの保存件数または取引の順序が一致しません。');
    }
    const state = requireFinanceState({ ...metadata, transactions: ordered.map(row => row.data) });
    snapshot = { state, rows: new Map(state.transactions.map((data, i) => [data.id, { data, position: ordered[i].position }])) };
    return state;
  }

  return {
    loadState,
    async saveState(state, change) {
      if (!snapshot) throw new Error('保存済みの家計データを読み直してください。');
      await write(state, snapshot, change);
    },
    // Only called after an explicit restore decision. A known revision is still required.
    replaceState: state => write(state, undefined),
    clearLegacyCopies() {
      for (const key of legacyFinanceKeys) localStorage.removeItem(key);
    },
  };
}
