/** Expo's browser preview keeps its device preferences in local storage. */
export const kv = {
  getItem: (key: string): string | null => localStorage.getItem(key),
  setItem: (key: string, value: string): void => localStorage.setItem(key, value),
};
