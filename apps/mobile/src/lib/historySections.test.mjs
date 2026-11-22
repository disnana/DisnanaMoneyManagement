import { describe, expect, it } from 'vitest';
import { historyAmount, historySections } from './historySections';

const tx = (id, date, type, amount, extra = {}) => ({
  id, date, type, amount, title: id, accountId: 'bank', categoryId: type, ...extra,
});

describe('transaction history', () => {
  it('caps preview rows while keeping full-day totals and same-day source order', () => {
    const rows = [
      tx('income', '2026-11-21', 'income', 8000),
      tx('paid', '2026-11-22', 'expense', 1000, { pointUsed: 200 }),
      tx('move', '2026-11-22', 'transfer', 5000, { transferFee: 110, toAccountId: 'wallet' }),
      tx('advance', '2026-11-22', 'expense', 490, { advance: { for: '同僚' } }),
    ];
    const full = historySections(rows);
    expect(full.map(g => [g.key, g.net, g.data.map(t => t.id)])).toEqual([
      ['2026-11-22', -1110, ['paid', 'move', 'advance']], ['2026-11-21', 8000, ['income']],
    ]);
    expect(historySections(rows, 1)[0]).toMatchObject({ date: '2026-11-22', net: -1110, data: [rows[1]] });
    expect(historySections(rows, 0)).toEqual([]);
    expect(historySections([])).toEqual([]);
  });
  it('keeps the direction of refunds, zero and transfers readable without color', () => {
    expect(historyAmount({ type: 'expense', amount: -500 })).toBe('+¥500');
    expect(historyAmount({ type: 'income', amount: -500 })).toBe('-¥500');
    expect(historyAmount({ type: 'expense', amount: 0 })).toBe('¥0');
    expect(historyAmount({ type: 'transfer', amount: 1500 })).toBe('¥1,500');
  });
});
