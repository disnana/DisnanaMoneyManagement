#!/usr/bin/env node
/**
 * Shared policy for dependency audits.
 *   node scripts/audit-allowlist.mjs ids            -> prints `--ignore=GHSA-...` flags for `bun audit`
 *   node scripts/audit-allowlist.mjs npm [dir]      -> runs `npm audit --json` in dir and fails on any
 *                                                      high/critical advisory that is not allow-listed
 * Allow-list entries (.github/audit-allowlist.json) must carry a reason and an expiry date; once the date
 * passes they stop applying, so a known-and-accepted risk can never be forgotten.
 */
import { execFileSync } from 'node:child_process';
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
const ignored = new Set(active.map((e) => e.id));

const mode = process.argv[2];

if (mode === 'ids') {
  console.log(active.map((e) => `--ignore=${e.id}`).join(' '));
} else if (mode === 'npm') {
  const cwd = process.argv[3] ?? '.';
  let out;
  try {
    out = execFileSync('npm', ['audit', '--json'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    out = e.stdout; // npm audit exits non-zero when it finds anything
    if (!out) throw e;
  }
  const report = JSON.parse(out);
  const rank = { low: 1, moderate: 2, high: 3, critical: 4 };
  const advisories = new Map();
  for (const v of Object.values(report.vulnerabilities ?? {})) {
    for (const via of v.via) {
      if (typeof via !== 'object') continue;
      const id = via.url?.split('/').pop() ?? String(via.source);
      advisories.set(id, via);
    }
  }
  const blocking = [];
  for (const [id, a] of advisories) {
    const line = `${a.severity.padEnd(8)} ${id}  ${a.name}: ${a.title}`;
    if (rank[a.severity] >= rank.high && !ignored.has(id)) blocking.push(line);
    else console.log(`${ignored.has(id) ? 'allow-listed' : 'non-blocking'}  ${line}`);
  }
  if (blocking.length > 0) {
    console.error(`\nBlocking advisories in ${cwd}:`);
    for (const l of blocking) console.error(`  ${l}`);
    process.exit(1);
  }
  console.log(`\n${cwd}: no blocking advisories (${advisories.size} total reported)`);
} else {
  console.error('usage: audit-allowlist.mjs ids | npm [dir]');
  process.exit(2);
}
