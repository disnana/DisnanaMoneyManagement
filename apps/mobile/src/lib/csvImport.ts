import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { MAX_CSV_SIZE, readCsvRows } from '@dmm/core/utils/csv';
import { isMonemyCsvHeader, parseMonemyRows, type MonemyRow } from '@dmm/core/utils/monemyImport';
import { detectBankCsvFormat, parseBankCsvRows, type BankCsvFormat, type BankCsvRow } from '@dmm/core/utils/bankCsvImport';

export type CsvStatement = { format: 'monemy'; rows: MonemyRow[] } | { format: BankCsvFormat; rows: BankCsvRow[]; zeroAmountRows: number };

function digest(text: string): string {
  // Preserve the UTF-16LE fingerprints used by existing Monemy imports.
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const codeUnit = text.charCodeAt(i);
    bytes[i * 2] = codeUnit & 0xff;
    bytes[i * 2 + 1] = codeUnit >>> 8;
  }
  return bytesToHex(sha256(bytes));
}

export async function parseImportCsv(bytes: Uint8Array): Promise<CsvStatement> {
  if (bytes.length > MAX_CSV_SIZE) throw new Error('CSVは2MB以下にしてください。');

  // Hermes doesn't decode Windows-31J via TextDecoder. Keep decoding portable.
  const { default: encoding } = await import('encoding-japanese');
  const newline = bytes.findIndex((byte) => byte === 10 || byte === 13);
  // The SJIS detector rejects some CP932 extensions which the decoder supports.
  const charset = encoding.detect(bytes.subarray(0, newline === -1 ? bytes.length : newline), ['UTF8', 'SJIS']);
  if (!charset) throw new Error('UTF-8またはShift_JISのCSVを選択してください。');
  const text = encoding.convert(bytes, { from: charset, to: 'UNICODE', type: 'string' });
  // The CP932 converter emits an ASCII question mark for an unmapped byte sequence.
  if (charset === 'SJIS' && (text.match(/\?/g)?.length ?? 0) !== bytes.reduce((count, byte) => count + Number(byte === 63), 0)) {
    throw new Error('CSVに読み取れない文字が含まれています。');
  }
  if (charset === 'UTF8' && !encoding.detect(bytes, 'UTF8')) {
    throw new Error('CSVに読み取れない文字が含まれています。');
  }
  const table = readCsvRows(text);
  const format = detectBankCsvFormat(table[0]);
  if (format) return { format, ...parseBankCsvRows(format, table.slice(1), digest) };
  if (isMonemyCsvHeader(table[0])) {
    if (charset !== 'UTF8') throw new Error('MonemyのCSVはUTF-8で保存してください。');
    return { format: 'monemy', rows: parseMonemyRows(table, digest) };
  }
  throw new Error('CSVの列が一致しません。Monemy・三井住友銀行・PayPay銀行のCSVを選択してください。');
}
