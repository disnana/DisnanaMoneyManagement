import Storage from 'expo-sqlite/kv-store';

/** Native (iOS/Android): synchronous SQLite-backed key-value storage. */
export const kv = {
  getItem: (key: string): string | null => Storage.getItemSync(key),
  setItem: (key: string, value: string): void => Storage.setItemSync(key, value),
};
