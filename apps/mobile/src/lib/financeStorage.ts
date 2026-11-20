import { openDatabaseSync, type SQLiteStatement } from 'expo-sqlite';
import { STORAGE_KEY, type FinanceStorage } from '@dmm/core/store/finance';
import { parseFinanceBackup } from '@dmm/core/store/financeBackup';
import { createFinanceDatabase } from '@dmm/core/store/financeDatabase';
import { kv } from './kv';

const legacyKeys = [STORAGE_KEY, 'kakeibo_finance_state_v2', 'kakeibo_finance_state_v1'];

let repository: ReturnType<typeof createFinanceDatabase> | undefined;
function database() {
  if (repository) return repository;
  const connection = openDatabaseSync('dmm-finance.db');
  const statements = new Map<string, SQLiteStatement>();
  try {
    repository = createFinanceDatabase({
      exec: (sql) => connection.execSync(sql),
      run: (sql, ...bindings) => {
        let statement = statements.get(sql);
        if (!statement) {
          statement = connection.prepareSync(sql);
          statements.set(sql, statement);
        }
        statement.executeSync(...bindings);
      },
      all: (sql, ...bindings) => connection.getAllSync(sql, ...bindings),
    });
    return repository;
  } catch (error) {
    connection.closeSync();
    throw error;
  }
}

export const financeStorage: FinanceStorage = {
  loadState() {
    const db = database();
    const saved = db.load();
    if (saved) return saved;
    let raw: string | null = null;
    for (const key of legacyKeys) {
      raw = kv.getItem(key);
      if (raw !== null) break;
    }
    if (raw === null) return null;
    let migrated;
    try {
      migrated = parseFinanceBackup(raw);
    } catch {
      throw new Error('以前の家計データを確認できませんでした。元のデータは保存されています。');
    }
    db.save(migrated);
    return migrated;
  },
  saveState: (state, change) => database().save(state, change),
};

/** Explicit data erasure also removes the JSON copies retained by the migration. */
export function clearLegacyFinanceCopies() {
  for (const key of legacyKeys) kv.removeItem(key);
}
