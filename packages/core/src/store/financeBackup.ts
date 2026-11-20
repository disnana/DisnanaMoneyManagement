import type { FinanceState } from '../types/finance';
import { sanitizeState } from './finance';

const kind = 'dmm-finance-backup';
const collections = ['accounts', 'transactions', 'budgets', 'recurringItems', 'savingsGoals',
  'customCategories', 'ledgers', 'purchaseCandidates'] as const;

export function serializeFinanceBackup(state: FinanceState, createdAt = new Date()): string {
  return JSON.stringify({ format: kind, version: 1, createdAt: createdAt.toISOString(), state });
}

/** Also accepts older raw FinanceState JSON exports. Reject lossy sanitation before replacing a ledger. */
export function parseFinanceBackup(json: string): FinanceState {
  const document = JSON.parse(json) as { format?: string; version?: number; state?: unknown } | null;
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('家計データのバックアップファイルを選択してください。');
  }
  if (document.format !== undefined && (document.format !== kind || document.version !== 1)) {
    throw new Error('このバックアップ形式には対応していません。');
  }
  const payload = (document.format === kind ? document.state : document) as Partial<FinanceState> | undefined;
  const state = payload && typeof payload === 'object' ? sanitizeState(payload) : null;
  if (!state || !payload || collections.some((key) => {
    const collection = payload[key];
    return collection !== undefined && (!Array.isArray(collection) || collection.length !== (state[key]?.length ?? 0));
  }) || new Set(state.transactions.map((item) => item.id)).size !== state.transactions.length) {
    throw new Error('バックアップに読み取れない家計データが含まれています。');
  }
  return state;
}
