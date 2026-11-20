import type { FinanceState } from '../types/finance';
import { requireFinanceState } from './financeState';

const format = 'dmm-finance-backup';

export function serializeFinanceBackup(state: FinanceState, createdAt = new Date()): string {
  return JSON.stringify({ format, version: 1, createdAt: createdAt.toISOString(), state });
}

/** Restore both versioned backups and the original Web app's raw JSON export. */
export function parseFinanceBackup(json: string): FinanceState {
  const document = JSON.parse(json);
  if (document && typeof document === 'object' && 'format' in document) {
    if (document.format !== format || document.version !== 1) throw new Error('このバックアップ形式には対応していません。');
    return requireFinanceState(document.state);
  }
  return requireFinanceState(document);
}
