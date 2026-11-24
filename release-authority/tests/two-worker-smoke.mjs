import assert from 'node:assert/strict';
import { createPublicKey, verify, X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as timers } from 'node:timers/promises';
import { exportJWK, generateKeyPair, importSPKI, SignJWT } from 'jose';
import { manifestWire, randomId, sha256Hex } from '../packages/protocol/manifest.mjs';
import { verifyUploadReceipt } from '../packages/protocol/receipt.mjs';

const [mode, scratch] = process.argv.slice(2);
const statePath = scratch + '/test-state.json';
const approvalOrigin = 'https://approval.fixture.invalid';
const verifierOrigin = 'https://verifier.fixture.invalid';
const keyId = 'fixture-key';
const team = 'fixture-team';
const administrator = 'fixture-admin';
const hash = 'c'.repeat(64);
const signingInput = Buffer.from('31050403010203', 'hex');
const certificate = new X509Certificate(await readFile(scratch + '/fixture-upload-cert.pem'));

if (mode === 'prepare') {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(publicKey), kid: keyId, alg: 'RS256' };
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const release = {
    appId: 'moneychan', packageName: 'com.disnana.mane_chan', repositoryId: '101',
    track: 'alpha', keyId: 'upload-fixture', certificate: await sha256Hex(certificate.raw),
    version: 1, rsaBits: 2048, releaseStatus: 'upload-only',
  };
  const policy = {
    repositoryId: release.repositoryId, ownerId: '102', ref: 'refs/heads/main',
    subject: 'repo:fixture/app:ref:refs/heads/main', audience: 'urn:release:test:verify',
    callerRef: 'fixture/app/.github/workflows/ci.yml@refs/heads/main',
    reusableRef: `fixture/authority/.github/workflows/verify.yml@${'d'.repeat(40)}`,
    reusableSha: 'd'.repeat(40), secretSha256: await sha256Hex(secret),
  };
  const access = { team, audience: 'fixture-audience', administrators: [administrator] };
  const finalizerSecret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const finalizer = {
    ...policy, audience: 'urn:release:test:finalize', secretSha256: await sha256Hex(finalizerSecret),
    reusableRef: `fixture/authority/.github/workflows/finalize.yml@${'a'.repeat(40)}`, reusableSha: 'a'.repeat(40),
  };
  const commitSha = 'e'.repeat(40);
  const publisherSecret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const publisher = {
    ...finalizer, callerSha: commitSha, audience: 'urn:release:test:publish',
    secretSha256: await sha256Hex(publisherSecret),
  };
  const now = Math.floor(Date.now() / 1000);
  const issueToken = (profile, runId) => new SignJWT({
    repository_id: release.repositoryId, repository_owner_id: policy.ownerId,
    ref: profile.ref, workflow_ref: profile.callerRef, workflow_sha: commitSha,
    sha: commitSha, job_workflow_ref: profile.reusableRef, job_workflow_sha: profile.reusableSha,
    event_name: 'workflow_dispatch', runner_environment: 'github-hosted', run_id: runId, run_attempt: '1',
  }).setProtectedHeader({ alg: 'RS256', kid: keyId }).setIssuer('https://token.actions.githubusercontent.com')
    .setAudience(profile.audience).setSubject(profile.subject).setIssuedAt(now).setNotBefore(now)
    .setJti(randomId()).setExpirationTime(now + 180).sign(privateKey);
  const token = await issueToken(policy, '103');
  const finalizerToken = await issueToken(finalizer, '105');
  const publisherToken = await issueToken(publisher, '105');
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuer(`https://${team}.cloudflareaccess.com`).setAudience(access.audience)
    .setSubject(administrator).setIssuedAt(now).setExpirationTime(now + 180).sign(privateKey);
  const releaseId = randomId();
  const wire = manifestWire({
    schema: 'disnana.release-manifest.v1', releaseId, nonce: randomId(),
    appId: release.appId, packageName: release.packageName, repositoryId: release.repositoryId,
    versionName: '1.0.0', versionCode: 6, commitSha, buildRunId: '99', buildRunAttempt: 1,
    buildWorkflowSha: 'f'.repeat(40), verifierRunId: '103', verifierWorkflowSha: policy.reusableSha,
    artifactId: '104', unsignedAabSha256: hash, manifestSha256: hash, signatureFileSha256: hash,
    signingInputSha256: await sha256Hex(signingInput), signingInputLength: signingInput.length,
    buildProofSha256: hash, artifactProofSha256: hash,
    auditReportSha256: hash, sbomSha256: hash, algorithm: 'SHA256withRSA', keyId: release.keyId,
    uploadCertificateSha256: release.certificate, targetTrack: release.track, releaseStatus: release.releaseStatus,
    policyVersion: 1, issuedAt: new Date(now * 1000).toISOString(),
    expiresAt: new Date((now + 120) * 1000).toISOString(),
  });
  for (const [name, value] of Object.entries({
    'jwks.json': { keys: [jwk] }, 'release-policy.json': release, 'access-policy.json': access,
    'verifier-policy.json': policy, 'finalizer-policy.json': finalizer, 'publisher-policy.json': publisher,
  })) await writeFile(`${scratch}/${name}`, JSON.stringify(value));
  await writeFile(statePath, JSON.stringify({
    releaseId, wire, secret, token, jwt, finalizerSecret, finalizerToken, publisherSecret, publisherToken,
  }));
} else if (mode === 'exercise') {
  const {
    releaseId, wire, secret, token, jwt, finalizerSecret, finalizerToken, publisherSecret, publisherToken,
  } = JSON.parse(await readFile(statePath, 'utf8'));
  const verifyHeaders = { authorization: `Bearer ${token}`, 'x-release-secret': secret };
  const accessHeaders = { 'cf-access-jwt-assertion': jwt, origin: approvalOrigin };
  const page = `${approvalOrigin}/approve/${releaseId}`;
  const registration = verifierOrigin + '/v1/releases';
  const edge = (target, headers = {}, body, entry = '/') => fetch('http://127.0.0.1:45919' + entry, {
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers, 'x-fixture-target': target },
    method: body ? 'POST' : 'GET', body,
  });
  assert.equal((await edge(page)).status, 404);
  const script = await edge(approvalOrigin + '/approve.js', accessHeaders);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /^application\/javascript/);
  assert.match(await script.text(), /addEventListener/);
  assert.equal((await edge(verifierOrigin + '/approve.js', accessHeaders)).status, 404);
  assert.equal((await edge(registration, accessHeaders, wire)).status, 404);
  assert.equal((await edge(approvalOrigin + '/v1/releases', verifyHeaders, wire)).status, 404);
  assert.equal((await edge(registration, verifyHeaders, wire, '/private-default')).status, 404);
  assert.equal((await edge(registration, { ...verifyHeaders, authorization: 'Bearer fabricated.jwt.value' }, wire)).status, 404);
  const registered = await edge(registration, verifyHeaders, wire);
  assert.equal(registered.status, 200);
  const { releaseHash } = await registered.json();
  const resultUrl = `${registration}/${releaseId}/result`;
  const finalizerHeaders = {
    authorization: `Bearer ${finalizerToken}`, 'x-release-secret': finalizerSecret,
    'content-type': 'application/octet-stream', 'x-release-hash': releaseHash,
  };
  assert.equal((await edge(resultUrl, finalizerHeaders, signingInput)).status, 409);
  assert.equal((await edge(resultUrl, { ...finalizerHeaders, ...verifyHeaders }, signingInput)).status, 404);
  assert.equal(releaseHash, await sha256Hex(wire));
  assert.equal((await edge(registration, verifyHeaders, wire)).status, 200);
  const view = await edge(page, accessHeaders);
  assert.equal(view.status, 200);
  assert.match(await view.text(), /com\.disnana\.mane_chan/);
  const armed = await edge(page + '/arm', accessHeaders, JSON.stringify({ hash: releaseHash }));
  assert.equal(armed.status, 200);
  const { nonce } = await armed.json();
  const confirmBody = JSON.stringify({ hash: releaseHash, nonce });
  assert.equal((await edge(page + '/confirm', accessHeaders, confirmBody)).status, 409);
  assert.equal((await edge(page + '/confirm', { ...accessHeaders, origin: verifierOrigin }, confirmBody)).status, 403);
  await timers(8100);
  assert.equal((await edge(page + '/confirm', accessHeaders, confirmBody)).status, 204);
  assert.equal((await edge(page + '/confirm', accessHeaders, confirmBody)).status, 409);
  await timers(1600);
  assert.equal((await edge(registration + '/sign', verifyHeaders, wire)).status, 404);
  assert.equal((await edge(page + '/audit', accessHeaders)).status, 404);
  assert.equal((await edge(resultUrl, finalizerHeaders, Buffer.from('31050403010204', 'hex'))).status, 409);
  const signed = await edge(resultUrl, finalizerHeaders, signingInput);
  assert.equal(signed.status, 200);
  const result = await signed.json();
  assert.equal(result.status, 'signed');
  assert.equal(verify('sha256', signingInput, certificate.publicKey, Buffer.from(result.signature, 'base64')), true);
  const cached = await edge(resultUrl, finalizerHeaders, signingInput);
  assert.equal(cached.status, 200);
  assert.deepEqual(await cached.json(), { ...result, status: 'cached' });
  const upload = `${registration}/${releaseId}/upload`;
  const publisherHeaders = { authorization: `Bearer ${publisherToken}`, 'x-release-secret': publisherSecret };
  const receiptPem = await readFile(scratch + '/fixture-receipt-public.pem', 'utf8');
  const receiptSpki = createPublicKey(receiptPem).export({ type: 'spki', format: 'der' });
  const report = {
    phase: 'start', releaseHash, signatureHash: result.signatureHash, signedAabSha256: hash, versionCode: 6,
    receiptKeyId: 'fixture-receipt', receiptPublicKeySha256: await sha256Hex(receiptSpki),
  };
  assert.equal((await edge(upload, verifyHeaders, JSON.stringify(report))).status, 404);
  assert.equal((await edge(upload, publisherHeaders, JSON.stringify({ ...report, receiptPublicKeySha256: hash }))).status, 409);
  assert.deepEqual(await (await edge(upload, publisherHeaders, JSON.stringify(report))).json(), { status: 'reserved' });
  assert.equal((await edge(upload, publisherHeaders, JSON.stringify(report))).status, 409);
  const completed = { ...report, phase: 'finish', result: 'stored' };
  const receiptKey = await importSPKI(receiptPem, 'ES256');
  for (let attempt = 0; attempt < 2; attempt++) {
    const stored = await (await edge(upload, publisherHeaders, JSON.stringify(completed))).json();
    assert.equal(stored.status, 'recorded');
    await verifyUploadReceipt(stored.receipt, {
      keyId: 'fixture-receipt', publicKey: receiptKey, manifest: JSON.parse(wire),
      report: completed, runId: '105', runAttempt: 1,
    });
  }
  console.log('Gateway routes, authenticated approval, dispatch alarm, one RSA signature, and upload audit verified.');
} else {
  throw new Error('Expected prepare or exercise');
}
