import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types/finance';
import { createTransactionSearch, normalizeTransactionSearch } from './transactionSearch';

describe('transaction search', () => {
  it('matches normalized queries across fields and uses renamed accounts and edited records', () => {
    const row: Transaction = {
      id: 'tx', type: 'transfer', amount: 350, date: '2026-11-20',
      title: 'ＣＯＦＦＥＥ', memo: 'ｶﾌｪ', categoryId: 'custom_test', accountId: 'cash', toAccountId: 'bank',
    };
    const categories = [{ id: 'custom_test', name: '会議費', type: 'expense' as const, color: '#000000' }];
    const search = createTransactionSearch(categories, { cash: 'お財布', bank: '銀行Ｂ' });
    const rows = [row, { ...row, id: 'next', title: 'お茶', memo: '持ち帰り' }];
    for (const query of [' coffee ', 'カフェ']) {
      expect(search(rows, normalizeTransactionSearch(query))).toEqual([row]);
    }
    for (const query of ['会議費', 'お財布', '銀行b']) {
      expect(search(rows, normalizeTransactionSearch(query))).toEqual(rows);
    }
    expect(search(rows, 'カ')).toEqual([row]);
    expect(search(rows, 'カフェ')).toEqual([row]);
    expect(search(rows, '')).toBe(rows);
    expect(search(rows, 'お茶')).toEqual([rows[1]]);
    expect(createTransactionSearch(categories, { bank: '貯金口座' })(rows, '銀行b')).toEqual([]);
  });
});
