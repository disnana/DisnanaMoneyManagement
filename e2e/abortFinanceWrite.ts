import type { Page } from '@playwright/test';

/** Exercise IndexedDB transaction failure once, while keeping the actual read and retry paths intact. */
export async function abortNextFinanceWrite(page: Page) {
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (this.name === 'dmm-finance' && tx.mode === 'readwrite') {
        IDBDatabase.prototype.transaction = transaction;
        queueMicrotask(() => tx.abort());
      }
      return tx;
    };
  });
}
