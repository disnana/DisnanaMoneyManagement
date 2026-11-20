/** Web preview only: localStorage. */
export const kv = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItemStrict: (key: string, value: string): void => localStorage.setItem(key, value),
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};
