export const MAX_CSV_SIZE = 2_000_000;
const MAX_RECORDS = 10_001; // Header plus up to 10,000 transactions.

/** Strict RFC-style CSV: quoted commas/newlines and doubled quotes are supported. */
export function readCsvRows(text: string): string[][] {
  if (text.length > MAX_CSV_SIZE) throw new Error('CSVは2MB以下にしてください。');
  if (text.includes('\uFFFD') || text.includes('\0')) throw new Error('対応する文字コードのCSVを選択してください。');
  text = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const endField = () => { row.push(field); field = ''; closed = false; };
  const endRow = () => {
    endField();
    if (row.some((value) => value !== '')) {
      if (rows.length >= MAX_RECORDS) throw new Error('1回の取り込みは10,000件までです。');
      rows.push(row);
    }
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += c;
    } else if (c === ',') endField();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else if (c === '"' && field === '' && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error('CSVの引用符が不正です。'); field += c; }
  }
  if (quoted) throw new Error('CSVの引用符が閉じられていません。');
  if (field !== '' || row.length || closed) endRow();
  return rows;
}

export function csvHeaderMatches(header: string[] | undefined, expected: readonly string[]): boolean {
  return header?.length === expected.length && header.every((value, i) => value.trim() === expected[i]);
}
