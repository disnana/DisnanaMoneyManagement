import { csvDate, csvIntegerYen } from './csv';
import type { StatementCsvRow } from './bankCsvImport';

const HEADER_START = ['利用日', '利用店名・商品名', '利用者', '支払方法', '利用金額', '手数料/利息', '支払総額'];
const MONTH = '(?:[1-9]|1[0-2])月';

export function isRakutenCsvHeader(rawHeader?: string[]): boolean {
  const header = rawHeader?.map((value) => value.trim().normalize('NFKC'));
  return header?.length === 11
    && HEADER_START.every((name, index) => header[index] === name)
    && new RegExp(`^${MONTH}支払金額$`).test(header[7])
    && header[8] === '当月請求額'
    && new RegExp(`^${MONTH}繰越残高$`).test(header[9])
    && header[10] === '新規サイン';
}

export function parseRakutenCsvRows(table: string[][], digest: (value: string) => string) {
  const rows: StatementCsvRow[] = [];
  const occurrences = new Map<string, number>();
  let zeroAmountRows = 0;
  let unsupportedRows = 0;
  let previous: StatementCsvRow | undefined;
  table.forEach((row, index) => {
    try {
      if (row.length !== 11) throw new Error('列数が一致しません。');
      const [rawDate, shop, holder, paymentMethod, rawAmount, rawFee] = row;
      const title = shop.trim();
      if (rawDate.trim() === '' && /^現地利用額/.test(title) && row.slice(2).every((value) => !value.trim())) {
        if (previous) previous.memo = [previous.memo, title].filter(Boolean).join('\n');
        return;
      }
      previous = undefined;
      const [year, month, day, extra] = rawDate.trim().split('/');
      if (!day || extra !== undefined) throw new Error('利用日が不正です。');
      const date = csvDate(year, month, day);
      const amount = csvIntegerYen(rawAmount);
      const fee = rawFee.trim() === '' ? 0 : csvIntegerYen(rawFee);
      const method = paymentMethod.trim().normalize('NFKC');
      if (amount === 0 && fee === 0) { zeroAmountRows++; return; }
      // Installments and credits need a billing model that can allocate them across statements.
      if (amount <= 0 || fee !== 0 || !/^(?:1回払(?:い)?|一括(?:払(?:い)?)?)$/.test(method)) {
        unsupportedRows++;
        return;
      }
      // Monthly payment, carry-over and exchange note columns can change on a later export.
      const key = digest(JSON.stringify([date, title, holder.trim(), amount]));
      const ordinal = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, ordinal);
      previous = { date, title, type: 'expense', amount, memo: '', fingerprint: `${key}_${ordinal}` };
      rows.push(previous);
    } catch (error) {
      throw new Error(`${index + 2}行目: ${(error as Error).message}`);
    }
  });
  if (!rows.length) throw new Error('取り込める楽天カードの明細がありません。手数料のない1回払いの利用明細に対応しています。');
  return { rows, zeroAmountRows, unsupportedRows };
}
