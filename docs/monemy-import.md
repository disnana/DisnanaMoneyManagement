# Monemy CSV import (mobile)

Settings → データ管理 → Monemy CSVから取り込む. Choose a UTF-8 CSV, then its destination JPY account. Review the count, income/expense totals, date range and sample rows; press the explicit add button to confirm. Cancel makes no changes. Confirmation succeeds after local storage accepts the write. A write failure keeps the preview open for retry. Existing transactions, opening balances, budgets and goals are retained. Categories and notes are preserved.

Expected exact header (optional UTF-8 BOM):

```csv
日付,区分,項目,収入金額,支出金額,内容,メモ
2026-11-20,支出,食費,,500.0,昼食,架空のテストデータ
```

Only income/expense, YYYY-MM-DD, nonnegative safe integer yen (including `.0`) are supported. The opposite amount column must be empty. Quoted commas, escaped quotes, multiline notes and CRLF are supported. Any malformed/unsupported row blocks the entire import. Limits: 2 MB, 10,000 transactions. No external upload is performed by the importer.

CSV has no account metadata: split mixed-account files before import. Linked debit and foreign-currency accounts are excluded. Opening balances are not recalculated: using a current balance as an opening balance and then adding historical transactions double-counts them. Transfers, refunds, taxes, credit billing and foreign currencies cannot be inferred from this CSV and need separate review.

Duplicate protection uses canonical row content, occurrence ordinal and target account. Two identical rows in one file are retained. Re-importing that file to the same account adds zero. Reordered rows remain idempotent. Changed content, another destination account, or manually entered equivalent transactions are not detected as duplicates. With partially overlapping exports containing indistinguishable transactions, occurrence counts cannot prove identity; review them rather than assuming perfect deduplication. Transaction IDs are independent of the imported content. The app keeps a SHA-256 fingerprint (computed from UTF-16LE canonical text) and the original destination account for duplicate detection. IDs from earlier draft builds are recognized when reimporting.

## Setup and checks

Install the updated mobile lockfile with `bun install --frozen-lockfile` in `apps/mobile`. DocumentPicker is included in Expo Go. Custom native development/production builds must be rebuilt to include the new native module; do not deliver this dependency solely via OTA to older binaries.

Run root `bun run test`, `bun run lint`, `bunx tsc --noEmit -p packages/core/tsconfig.json`, and `bun run build`. Run `bunx tsc --noEmit` and `bunx expo export --platform ios --platform android` in `apps/mobile`.

Before real data, test a fabricated CSV on an iPhone/Android device: cancel file picker; cancel account picker; inspect preview; cancel preview; confirm; re-import (zero added); include two identical source rows (both retained initially); try bad date/fractional amount (nothing added). Compare account balance and transaction count before/after. Automated parser tests do not replace device picker/UI testing.
