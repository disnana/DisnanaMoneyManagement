import { describe, expect, it } from 'vitest';
import { initialReceiptItems, receiptImportDraft, stageReceiptImport, getReceiptImport, clearReceiptImport } from './receiptImport';

const receipt = {
  status: 'success', document_type: 'itemized_receipt', merchant: 'みどり文具店', currency: 'JPY', date: '2026-11-24',
  total_minor: 850,
  items: [{ name: 'ノート', amount_minor: 540 }, { name: 'ペン', amount_minor: 360 }],
};

describe('receipt expense import', () => {
  it('keeps the printed total, including any receipt-wide adjustment, for an unchanged merchant entry', () => {
    const draft = receiptImportDraft(receipt, 'merchant', initialReceiptItems(receipt));
    expect(draft).toMatchObject({ total: 850, entries: [], memo: 'ノート / ペン' });
    expect(receiptImportDraft({ ...receipt, items: [] }, 'merchant', [])).toMatchObject({ total: 850 });
  });

  it('recalculates a grouped total when items are excluded or their amounts are corrected', () => {
    const items = initialReceiptItems(receipt);
    items[0] = { ...items[0], name: '方眼ノート', amount: '510' };
    items[1].included = false;
    expect(receiptImportDraft(receipt, 'merchant', items)).toMatchObject({ total: 510, memo: '方眼ノート' });
    items[0].included = false;
    expect(receiptImportDraft(receipt, 'merchant', items)).toBeUndefined();
  });

  it('builds one positive expense for each corrected, included item', () => {
    const items = initialReceiptItems(receipt);
    items[0] = { ...items[0], name: '手帳', amount: '600' };
    expect(receiptImportDraft(receipt, 'items', items)).toMatchObject({
      total: 960,
      entries: [{ title: '手帳', amount: 600 }, { title: 'ペン', amount: 360 }],
    });
    items[1].amount = '';
    expect(receiptImportDraft(receipt, 'items', items)).toBeUndefined();
    items[1].included = false;
    expect(receiptImportDraft(receipt, 'items', items)).toMatchObject({ total: 600 });
  });

  it('allows a printed yen total when details are missing but refuses foreign or unreadable imports', () => {
    const partial = { ...receipt, status: 'partial', items: [{ name: 'ペン', amount_minor: null }] };
    const edits = initialReceiptItems(partial);
    expect(receiptImportDraft(partial, 'merchant', edits)).toMatchObject({ total: 850 });
    expect(receiptImportDraft(partial, 'items', edits)).toBeUndefined();
    expect(receiptImportDraft({ ...partial, currency: 'USD' }, 'merchant', edits)).toBeUndefined();
    expect(receiptImportDraft({ ...partial, status: 'unreadable' }, 'merchant', edits)).toBeUndefined();
  });

  it('keeps an import accessible only through its own pending ID', () => {
    const draft = receiptImportDraft(receipt, 'items', initialReceiptItems(receipt));
    stageReceiptImport('first', draft);
    expect(getReceiptImport('second')).toBeUndefined();
    clearReceiptImport('second');
    expect(getReceiptImport('first')).toBe(draft);
    clearReceiptImport('first');
    expect(getReceiptImport('first')).toBeUndefined();
  });
});
