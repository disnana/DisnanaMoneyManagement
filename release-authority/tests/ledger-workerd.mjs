import { DurableObject } from 'cloudflare:workers';
import { ReleaseLedger } from './ledger.mjs';
import { manifestWire, sha256Hex } from './manifest.mjs';

const admin = 'fixture-admin';
const signer = { role: 'signer' };
const verifier = { role: 'verifier', repositoryId: '123', runId: '456', workflowSha: 'a'.repeat(40), commitSha: 'b'.repeat(40) };
const fingerprint = '1'.repeat(64);
const releaseId = 'c'.repeat(32);
const signingInput = new TextEncoder().encode('fixture only');

function check(condition) {
  if (!condition) throw new Error('Durable Object fixture assertion failed');
}

export class FixtureLedger extends DurableObject {
  async fetch() {
    let now = Date.parse('2026-11-24T00:00:00.000Z');
    const storage = this.ctx.storage;
    const policy = {
      appId: 'moneychan', packageName: 'com.disnana.mane_chan', track: 'alpha',
      keyId: 'fixture', certificate: fingerprint, version: 1, repositoryId: verifier.repositoryId,
      disabled: () => false, isAdministrator: (id) => id === admin, isSigner: () => true, signatureLength: 256,
    };
    const ledger = new ReleaseLedger(storage.sql, (action) => storage.transactionSync(action), policy, () => now);
    const wire = manifestWire({
      schema: 'disnana.release-manifest.v1', releaseId, nonce: 'd'.repeat(32), appId: policy.appId,
      packageName: policy.packageName, repositoryId: policy.repositoryId,
      versionName: '1.0.0', versionCode: 6, commitSha: verifier.commitSha,
      buildRunId: '99', buildRunAttempt: 1, buildWorkflowSha: 'd'.repeat(40),
      verifierRunId: verifier.runId, verifierWorkflowSha: verifier.workflowSha, artifactId: '101',
      unsignedAabSha256: fingerprint, manifestSha256: fingerprint, signatureFileSha256: fingerprint,
      signingInputSha256: await sha256Hex(signingInput), signingInputLength: signingInput.length,
      buildProofSha256: fingerprint, artifactProofSha256: fingerprint, auditReportSha256: fingerprint,
      sbomSha256: fingerprint, algorithm: 'SHA256withRSA', keyId: policy.keyId, uploadCertificateSha256: fingerprint,
      targetTrack: policy.track, releaseStatus: 'draft', policyVersion: policy.version,
      issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 900_000).toISOString(),
    });
    const hash = await ledger.register(wire, verifier);
    const nonce = await ledger.arm(releaseId, hash, admin);
    now += 8000;
    const confirmations = await Promise.allSettled([
      ledger.confirm(releaseId, hash, admin, nonce), ledger.confirm(releaseId, hash, admin, nonce),
    ]);
    check(confirmations.filter((result) => result.status === 'fulfilled').length === 1);
    const reservations = await Promise.allSettled([
      ledger.beginSigning(releaseId, hash, signingInput, signer),
      ledger.beginSigning(releaseId, hash, signingInput, signer),
    ]);
    const winners = reservations.filter((result) => result.status === 'fulfilled');
    check(winners.length === 1);
    await ledger.finishSigning(releaseId, winners[0].value.attemptId, new Uint8Array(256), signer);
    let prior = '0'.repeat(64);
    for (const entry of ledger.auditEvents()) {
      check(JSON.parse(entry.body).previousHash === prior && entry.hash === await sha256Hex(entry.body));
      prior = entry.hash;
    }
    return Response.json({ state: ledger.read(releaseId).state, auditCount: ledger.auditEvents().length });
  }
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/test-ledger') return new Response(null, { status: 404 });
    return env.LEDGER.get(env.LEDGER.newUniqueId()).fetch(request);
  },
};
