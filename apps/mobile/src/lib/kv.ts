import Storage from 'expo-sqlite/kv-store';

const write = (key: string, value: string) => Storage.setItemSync(key, value);

/** Native (iOS/Android): synchronous SQLite-backed key-value storage. */
export const kv = {
  getItem: (key: string): string | null => Storage.getItemSync(key),
  setItem: write,
  setItemStrict: write,
};
