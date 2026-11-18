import * as React from 'react';
import { createFinanceStoreHook, type StorageAdapter } from '@dmm/core/store/finance';

const localStorageAdapter: StorageAdapter = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore storage quota errors
    }
  },
};

export const useFinanceStore = createFinanceStoreHook(React, localStorageAdapter);
