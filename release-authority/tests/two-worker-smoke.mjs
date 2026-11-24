import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as timers } from 'node:timers/promises';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { manifestWire, randomId, sha256Hex } from '../packages/protocol/manifest.mjs';

const [mode, scratch] = process.argv.slice(2);
const statePath = scratch + '/test-state.json';
const approvalOrigin = 'https://approval.fixture.invalid';
const verifierOrigin = 'https://verifier.fixture.invalid';
const keyId = 'fixture-key';
const team = 'fixture-team';
const administrator = 'fixture-admin';
const hash = 'c'.repeat(64);

if (mode === 'prepare') {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(publicKey), kid: keyId, alg: 'RS256' };
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const release = {
    appId: 'moneychan', packageName: 'com.disnana.mane_chan', repositoryId: '101',
    track: 'alpha', keyId: 'upload-fixture', certificate: hash, version: 1,
  };
  const policy = {
    repositoryId: release.repositoryId, ownerId: '102', ref: 'refs/heads/main',
    subject: 'repo:fixture/app:ref:refs/heads/main', audience: 'urn:release:test:verify',
    callerRef: 'fixture/app/.github/workflows/ci.yml@refs/heads/main',
    reusableRef: `fixture/authority/.github/workflows/verify.yml@${'d'.repeat(40)}`,
    reusableSha: 'd'.repeat(40), secretSha256: await sha256Hex(secret),
  };
  const access = { team, audience: 'fixture-audience', administrators: [administrator] };
  const commitSha = 'e'.repeat(40);
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    repository_id: release.repositoryId, repository_owner_id: policy.ownerId,
    ref: policy.ref, workflow_ref: policy.callerRef, workflow_sha: commitSha,
    sha: commitSha, job_workflow_ref: policy.reusableRef, job_workflow_sha: policy.reusableSha,
    event_name: 'workflow_dispatch', runner_environment: 'github-hosted', run_id: '103', run_attempt: '1',
  }).setProtectedHeader({ alg: 'RS256', kid: keyId }).setIssuer('https://token.actions.githubusercontent.com')
    .setAudience(policy.audience).setSubject(policy.subject).setIssuedAt(now).setNotBefore(now)
    .setJti(randomId()).setExpirationTime(now + 180).sign(privateKey);
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
    signingInputSha256: hash, signingInputLength: 153, buildProofSha256: hash, artifactProofSha256: hash,
    auditReportSha256: hash, sbomSha256: hash, algorithm: 'SHA256withRSA', keyId: release.keyId,
    uploadCertificateSha256: hash, targetTrack: release.track, releaseStatus: 'draft',
    policyVersion: 1, issuedAt: new Date(now * 1000).toISOString(),
    expiresAt: new Date((now + 120) * 1000).toISOString(),
  });
  for (const [name, value] of Object.entries({
    'jwks.json': { keys: [jwk] }, 'release-policy.json': release, 'access-policy.json': access, 'verifier-policy.json': policy,
  })) await writeFile(`${scratch}/${name}`, JSON.stringify(value));
  await writeFile(statePath, JSON.stringify({ releaseId, wire, secret, token, jwt }));
} else if (mode === 'exercise') {
  const { releaseId, wire, secret, token, jwt } = JSON.parse(await readFile(statePath, 'utf8'));
  const verifyHeaders = { authorization: `Bearer ${token}`, 'x-release-secret': secret };
  const accessHeaders = { 'cf-access-jwt-assertion': jwt, origin: approvalOrigin };
  const page = `${approvalOrigin}/approve/${releaseId}`;
  const registration = verifierOrigin + '/v1/releases';
  const edge = (target, headers = {}, body, entry = '/') => fetch('http://127.0.0.1:45919' + entry, {
    headers: { ...headers, 'x-fixture-target': target, ...(body ? { 'content-type': 'application/json' } : {}) },
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
  assert.equal((await edge(registration + '/sign', verifyHeaders, wire)).status, 404);
  assert.equal((await edge(page + '/audit', accessHeaders)).status, 404);
  console.log('Gateway routes, signed identities, one SQLite approval, and private operations verified.');
} else {
  throw new Error('Expected prepare or exercise');
}
