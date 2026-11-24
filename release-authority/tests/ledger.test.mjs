import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { ReleaseLedger } from '../packages/protocol/ledger.mjs';
import { manifestWire, readManifest, sha256Hex } from '../packages/protocol/manifest.mjs';

const hashValue = 'e'.repeat(64);
const commitSha = 'c'.repeat(40);
const verifiedAt = Date.parse('2026-11-24T00:00:00.000Z');
const uploadCertificateSha256 = 'f'.repeat(64);
const administrator = 'fixture-admin';
const signer = { role: 'signer', identity: 'fixture-signer' };
const verifier = {
  role: 'verifier', repositoryId: '123', runId: '1234', workflowSha: 'a'.repeat(40), commitSha,
};
const bytes = new TextEncoder().encode('verified fixture signing bytes');

async function fixture(t, patch) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  let now = verifiedAt;
  let disabled = false;
  const sql = {
    exec(statement, ...args) {
      const query = db.prepare(statement);
      return { toArray: () => query.all(...args).map((row) => ({ ...row })) };
    },
  };
  // Force write queries to execute eagerly, as DO SQL cursors do.
  const query = sql.exec;
  sql.exec = (statement, ...args) => {
    if (!statement.startsWith('SELECT ')) {
      db.prepare(statement).run(...args);
      return { toArray: () => [] };
    }
    return query(statement, ...args);
  };
  function transactionSync(operation) {
    db.exec('BEGIN');
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  const policy = {
    appId: 'moneychan', packageName: 'com.disnana.mane_chan', track: 'alpha',
    keyId: 'fixture', certificate: uploadCertificateSha256, version: 1, repositoryId: '123',
    disabled: () => disabled, isAdministrator: (id) => [administrator, 'other-admin'].includes(id),
    isSigner: (principal) => principal.identity === signer.identity, signatureLength: 256, ...patch,
  };
  const ledger = new ReleaseLedger(sql, transactionSync, policy, () => now);
  const manifest = {
    schema: 'disnana.release-manifest.v1', releaseId: '1'.repeat(32), nonce: '2'.repeat(32), appId: 'moneychan',
    packageName: 'com.disnana.mane_chan', versionName: '1.0.0', versionCode: 6, repositoryId: '123',
    commitSha, buildRunId: '567', buildRunAttempt: 1, buildWorkflowSha: 'b'.repeat(40),
    verifierRunId: verifier.runId, verifierWorkflowSha: verifier.workflowSha, artifactId: '333',
    unsignedAabSha256: hashValue, manifestSha256: hashValue, signatureFileSha256: hashValue,
    signingInputSha256: await sha256Hex(bytes), signingInputLength: bytes.length,
    buildProofSha256: hashValue, artifactProofSha256: hashValue, auditReportSha256: hashValue, sbomSha256: hashValue,
    algorithm: 'SHA256withRSA', keyId: 'fixture', uploadCertificateSha256, targetTrack: 'alpha',
    releaseStatus: 'draft', policyVersion: 1, issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
  };
  const wire = manifestWire(manifest);
  const hash = await sha256Hex(wire);
  const register = () => ledger.register(wire, verifier);
  const arm = () => ledger.arm(manifest.releaseId, hash, administrator);
  const confirm = (nonce) => ledger.confirm(manifest.releaseId, hash, administrator, nonce);
  const begin = (input = bytes) => ledger.beginSigning(manifest.releaseId, hash, input, signer);
  const advance = (ms) => { now += ms; };
  const approve = async () => { await register(); const nonce = await arm(); advance(8_000); await confirm(nonce); };
  return { db, advance, ledger, manifest, wire, hash, register, arm, confirm, begin, approve, stop: () => { disabled = true; } };
}

test('registration rejects mismatched verifier, unknown fields and duplicate keys', async (t) => {
  const f = await fixture(t);
  assert.throws(() => readManifest(f.wire.replace('{', '{"releaseId":"wrong",')));
  assert.throws(() => manifestWire({ ...f.manifest, unexpected: true }));
  await assert.rejects(f.ledger.register(f.wire, { ...verifier, workflowSha: '0'.repeat(40) }), /identity mismatch/);
  assert.equal(f.ledger.auditEvents().length, 0);
});

test('same immutable release can be registered once and cannot be rebound', async (t) => {
  const f = await fixture(t);
  await f.register();
  assert.equal(await f.register(), f.hash);
  await assert.rejects(f.ledger.register(manifestWire({ ...f.manifest, artifactId: '900' }), verifier), /reassigned/);
  assert.equal(f.ledger.auditEvents().length, 1);
});

test('approval enforces auditor binding, minimum time and single use', async (t) => {
  const f = await fixture(t);
  await f.register();
  await assert.rejects(f.begin(), /Approval is unavailable/);
  const nonce = await f.arm();
  await assert.rejects(f.confirm(nonce), /timing/);
  f.advance(8_000);
  await assert.rejects(f.ledger.confirm(f.manifest.releaseId, f.hash, 'other-admin', nonce), /does not match/);
  await assert.rejects(f.confirm('0'.repeat(32)), /does not match/);
  const confirmations = await Promise.allSettled([f.confirm(nonce), f.confirm(nonce)]);
  assert.equal(confirmations.filter((r) => r.status === 'fulfilled').length, 1);
});

test('atomic reservation, input binding and audit chain survive duplicate requests', async (t) => {
  const f = await fixture(t);
  await f.approve();
  await assert.rejects(f.begin(new Uint8Array(bytes.length)), /does not match/);
  const results = await Promise.allSettled([f.begin(), f.begin(), f.begin()]);
  const winners = results.filter((r) => r.status === 'fulfilled');
  assert.equal(winners.length, 1);
  const written = new Uint8Array(256);
  await f.ledger.finishSigning(f.manifest.releaseId, winners[0].value.attemptId, written, signer);
  assert.equal((await f.begin()).status, 'cached');
  let previousHash = '0'.repeat(64);
  for (const [index, entry] of f.ledger.auditEvents().entries()) {
    const event = JSON.parse(entry.body);
    assert.equal(event.seq, index + 1);
    assert.equal(event.previousHash, previousHash);
    assert.equal(entry.hash, await sha256Hex(entry.body));
    previousHash = entry.hash;
  }
});

test('expired reservations quarantine rather than allowing a new signature', async (t) => {
  const f = await fixture(t);
  await f.approve();
  const first = await f.begin();
  f.advance(60_001);
  assert.equal((await f.begin()).status, 'quarantined');
  await assert.rejects(f.begin(), /Approval is unavailable/);
  await assert.rejects(f.ledger.finishSigning(f.manifest.releaseId, first.attemptId, new Uint8Array(256), signer));
});

test('kill switch, expired approval and write failure all prevent signing', async (t) => {
  const f = await fixture(t);
  await f.approve();
  // Simulate a database write failure after audit preparation; no state transition survives.
  f.db.exec("CREATE TRIGGER fail BEFORE UPDATE ON releases BEGIN SELECT RAISE(ABORT,'fixture write failure'); END;");
  await assert.rejects(f.begin(), /fixture write failure/);
  assert.equal(f.ledger.read(f.manifest.releaseId).state, 'APPROVED');
  assert.equal(f.ledger.auditEvents().length, 3);
  f.db.exec('DROP TRIGGER fail');
  f.advance(5 * 60_000);
  await assert.rejects(f.begin(), /Approval is unavailable/);
  f.stop();
  await assert.rejects(f.begin(), /disabled/);
});

test('independently verifies, persists and reuses one native RSA signature', async (t) => {
  const f = await fixture(t);
  const cmsInput = Uint8Array.of(0x31, 0x00);
  const manifest = { ...f.manifest, signingInputLength: cmsInput.length, signingInputSha256: await sha256Hex(cmsInput) };
  const wire = manifestWire(manifest);
  const hash = await f.ledger.register(wire, verifier);
  const nonce = await f.ledger.arm(manifest.releaseId, hash, administrator);
  f.advance(8000);
  await f.ledger.confirm(manifest.releaseId, hash, administrator, nonce);
  const { makeReleaseSigner } = await import('../workers/signer/sign-release.mjs');
  const key = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]),
  }, false, ['sign', 'verify']);
  let keyLoads = 0;
  const sign = makeReleaseSigner({ ledger: f.ledger, principal: signer, publicKey: key.publicKey,
    loadPrivateKey: () => { keyLoads++; return key.privateKey; }, disabled: () => false });
  const result = await sign(manifest.releaseId, hash, cmsInput);
  assert.equal(result.status, 'signed');
  const replay = await sign(manifest.releaseId, hash, cmsInput);
  assert.equal(replay.signature, result.signature);
  assert.equal(replay.status, 'cached');
  assert.equal(keyLoads, 1);
});

test('publish receipt binds the draft result to the independently signed evidence', async (t) => {
  const f = await fixture(t);
  const { issueDraftReceipt, verifyDraftReceipt } = await import('../packages/protocol/receipt.mjs');
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const signedAabSha256 = '1'.repeat(64);
  const request = {
    manifest: f.manifest, releaseHash: f.hash, approvalId: 'approval-fixture',
    approvedAt: '2026-11-24T00:00:10.000Z', signatureSha256: '2'.repeat(64), signedAabSha256,
    publisherRunId: '111', issuedAt: '2026-11-24T00:05:00.000Z', issuer: 'authority-fixture',
    keyId: 'receipt-test', receiptKey: key.privateKey,
    playResponse: { packageName: f.manifest.packageName, targetTrack: 'alpha', status: 'draft',
      versionCode: 6, sha256: signedAabSha256 },
  };
  const receipt = await issueDraftReceipt(request);
  const checks = { issuer: request.issuer, keyId: request.keyId, publicKey: key.publicKey, releaseHash: f.hash };
  assert.equal((await verifyDraftReceipt(receipt, checks)).signedAabSha256, signedAabSha256);
  await assert.rejects(verifyDraftReceipt(receipt, { ...checks, releaseHash: '0'.repeat(64) }));
  await assert.rejects(issueDraftReceipt({ ...request, playResponse: { ...request.playResponse, targetTrack: 'production' } }));
  await assert.rejects(issueDraftReceipt({ ...request, playResponse: { ...request.playResponse, sha256: '0'.repeat(64) } }));
  await assert.rejects(issueDraftReceipt({ ...request, keyId: f.manifest.keyId }));
});

test('expired pending request is audited and a new immutable manifest can reserve its version', async (t) => {
  const f = await fixture(t);
  await f.register();
  const now = verifiedAt + 15 * 60_000 + 1;
  f.advance(now - verifiedAt);
  const next = { ...f.manifest, releaseId: 'a'.repeat(32), issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString() };
  await f.ledger.register(manifestWire(next), verifier);
  assert.equal(f.ledger.read(f.manifest.releaseId).state, 'EXPIRED');
  assert.equal(f.ledger.read(next.releaseId).state, 'AWAITING_APPROVAL');
  assert.deepEqual(f.ledger.auditEvents().map((e) => JSON.parse(e.body).event.type), ['registered', 'expired', 'registered']);
});
