import type { StorageAdapter } from '@dmm/core/store/finance';
import { kv } from './kv';

export const financeStorage: StorageAdapter = { getItem: kv.getItem, setItem: kv.setItemStrict };

export function clearLegacyFinanceCopies() {}
