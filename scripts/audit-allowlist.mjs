#!/usr/bin/env bun
/**
 * Shared policy for dependency audits (Bun everywhere).
 *   bun scripts/audit-allowlist.mjs ids   -> one `--ignore=GHSA-...` flag per line, for `bun audit`
 * Allow-list entries (.github/audit-allowlist.json) must carry a reason and an expiry date; once the date
 * passes they stop applying, so a known-and-accepted risk can never be forgotten.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allow = JSON.parse(readFileSync(join(root, '.github/audit-allowlist.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

const active = allow.filter((e) => {
  if (!e.id || !e.reason || !e.expires) throw new Error(`allow-list entry needs id, reason, expires: ${JSON.stringify(e)}`);
  if (e.expires < today) {
    console.error(`::warning::allow-list entry ${e.id} expired on ${e.expires} - it no longer applies`);
    return false;
  }
  return true;
});
const mode = process.argv[2];

if (mode === 'ids') {
  // one flag per line so shells can read them safely with `mapfile`
  for (const e of active) console.log(`--ignore=${e.id}`);
} else {
  console.error('usage: bun scripts/audit-allowlist.mjs ids');
  process.exit(2);
}
