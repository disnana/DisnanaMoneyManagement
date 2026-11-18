import { buildTransactionsCsv } from '@dmm/core/utils/format';
import type { Transaction } from '@dmm/core/types/finance';
import { saveFile } from './saveFile';

export * from '@dmm/core/utils/format';

/** Web/Capacitor: build the CSV in core, then hand it to the OS (share sheet / download). */
export function exportTransactionsToCSV(
  transactions: Transaction[],
  accountMap: Record<string, string>,
  filename = 'dmm-transactions.csv'
): void {
  const blob = new Blob([buildTransactionsCsv(transactions, accountMap)], {
    type: 'text/csv;charset=utf-8;',
  });
  void saveFile(blob, filename);
}
