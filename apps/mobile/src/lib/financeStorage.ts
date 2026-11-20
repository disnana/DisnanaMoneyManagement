import { openDatabaseSync, type SQLiteStatement } from 'expo-sqlite';
import { legacyFinanceKeys, readLegacyFinanceState, type FinanceStorage } from '@dmm/core/store/finance';
import { createFinanceDatabase } from '@dmm/core/store/financeDatabase';
import { kv } from './kv';

let repository: ReturnType<typeof createFinanceDatabase> | undefined;
function database() {
  if (repository) return repository;
  const connection = openDatabaseSync('dmm-finance.db', { useNewConnection: true });
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
  loadState: () => database().load(() => readLegacyFinanceState(kv)),
  saveState: (state, change) => database().save(state, change),
  replaceState: (state) => database().replace(state),
  clearLegacyCopies: () => kv.removeItems(legacyFinanceKeys),
};
