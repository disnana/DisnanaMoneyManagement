// The root project already provides Playwright; no browser dependency is shipped in the Worker.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, webkit, devices } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '../workers/approval');
  const { makeApprovalHandler } = await import(path.join(root, 'handler.mjs'));
  const hash = 'a'.repeat(64);
  const nonce = 'b'.repeat(32);
  const origin = 'https://release.fixture.invalid';
  const calls = [];
  const ledger = {
    approvalView: () => ({ hash, manifest: {
      packageName: 'com.disnana.mane_chan', versionName: '1.0.0', versionCode: 6, targetTrack: 'alpha',
      commitSha: 'f'.repeat(40), buildRunId: '123', buildRunAttempt: 1, verifierRunId: '456',
      unsignedAabSha256: hash, artifactProofSha256: hash, auditReportSha256: hash, sbomSha256: hash,
      expiresAt: '2026-11-24T00:15:00.000Z',
    } }),
    arm: () => { calls.push('arm'); return nonce; },
    confirm: (id, fullHash, operator, suppliedNonce) => {
      assert.equal(fullHash, hash);
      assert.equal(suppliedNonce, nonce);
      calls.push('confirm');
    },
  };
  const assets = {
    '/approve.js': { body: await fs.readFile(path.join(root, 'approve.js')), type: 'application/javascript' },
    '/approve.css': { body: await fs.readFile(path.join(root, 'approve.css')), type: 'text/css' },
  };
  const handle = makeApprovalHandler({ origin, ledger, assets, authenticate: () => 'browser-fixture' });
  const browser = process.env.APPROVAL_BROWSER === 'webkit'
    ? await webkit.launch()
    : await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ ...devices['iPhone 14'] });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(origin + '/**', async (route) => {
      const req = route.request();
      const result = await handle(new Request(req.url(), {
        method: req.method(), headers: req.headers(), body: req.postData() ?? undefined,
      }));
      await route.fulfill({ status: result.status, headers: Object.fromEntries(result.headers),
        body: Buffer.from(await result.arrayBuffer()) });
    });
    await page.goto(`${origin}/approve/${'a'.repeat(32)}`);
    const arm = page.getByRole('button', { name: 'リリース承認に進む' });
    const hold = page.getByRole('button', { name: '3秒長押しで承認' });
    await arm.click();
    await hold.waitFor();
    assert.ok(await hold.isDisabled());
    assert.deepEqual(calls, ['arm']);
    await page.waitForFunction(() => !document.querySelector('#hold').disabled, null, { timeout: 8000 });
    await hold.focus();
    await page.keyboard.down('Space');
    await page.waitForTimeout(450);
    await page.keyboard.up('Space');
    assert.equal(await page.locator('#progress').evaluate((node) => node.value), 0);
    assert.deepEqual(calls, ['arm']);
    await page.keyboard.down('Space');
    await page.getByRole('status').getByText(/承認済み/).waitFor();
    await page.keyboard.up('Space');
    assert.deepEqual(calls, ['arm', 'confirm']);
    assert.deepEqual(errors, []);
    console.log(`${browser.browserType().name()} iPhone viewport: 5-second lockout, aborted hold and one confirmed hold passed.`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
