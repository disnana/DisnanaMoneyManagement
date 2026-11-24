import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { sha256Hex } from '../packages/protocol/manifest.mjs';
import { makeAccessAuthenticator, makeCiAuthenticator } from '../packages/verification/identity.mjs';

const key = await generateKeyPair('RS256', { extractable: true });
const jwk = { ...await exportJWK(key.publicKey), alg: 'RS256', kid: 'fixture' };
const resolveKey = createLocalJWKSet({ keys: [jwk] });
const now = Math.floor(Date.now() / 1000);
const secret = 'a'.repeat(43);
const policy = {
  role: 'verifier', repositoryId: '123', ownerId: '321',
  reusableSha: 'a'.repeat(40), ref: 'refs/heads/main',
  callerRef: 'org/app/.github/workflows/start.yml@refs/heads/main',
  reusableRef: `org/release-ci/.github/workflows/verify.yml@${'a'.repeat(40)}`,
  audience: 'urn:disnana:fixture:verifier', subject: 'repo:org/app:ref:refs/heads/main', secretSha256: await sha256Hex(secret),
};
const ci = makeCiAuthenticator(policy, { resolveKey, equal: timingSafeEqual });
const base = {
  iss: 'https://token.actions.githubusercontent.com', aud: policy.audience,
  sub: 'repo:org/app:ref:refs/heads/main', iat: now, nbf: now - 1, exp: now + 250, jti: 'fixture-id',
  repository_id: policy.repositoryId, repository_owner_id: policy.ownerId, ref: policy.ref,
  workflow_ref: policy.callerRef, workflow_sha: 'c'.repeat(40),
  job_workflow_ref: policy.reusableRef, job_workflow_sha: policy.reusableSha,
  sha: 'c'.repeat(40), run_id: '987', run_attempt: '1', event_name: 'workflow_dispatch',
  runner_environment: 'github-hosted',
};

function signed(claims, extra = {}) {
  return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'fixture', ...extra }).sign(key.privateKey);
}

function authorization(token, supplied = secret) {
  return new Headers({ authorization: `Bearer ${token}`, 'x-release-secret': supplied });
}

test('valid GitHub JWT and distinct 256-bit release secret are jointly required', async () => {
  const token = await signed(base);
  const result = await ci(authorization(token));
  assert.equal(result.runId, '987');
  assert.equal(result.workflowSha, policy.reusableSha);
  await assert.rejects(ci(new Headers({ 'x-release-secret': secret })));
  await assert.rejects(ci(new Headers({ authorization: `Bearer ${token}` })));
  await assert.rejects(ci(authorization(token, 'b'.repeat(43))));
});

test('32-byte hexadecimal secrets are authenticated using the digest of their text', async () => {
  const hexSecret = 'ab'.repeat(32);
  const hexCi = makeCiAuthenticator({ ...policy, secretSha256: await sha256Hex(hexSecret) }, { resolveKey, equal: timingSafeEqual });
  const token = await signed(base);
  assert.equal((await hexCi(authorization(token, hexSecret))).runId, '987');
  await assert.rejects(hexCi(authorization(token, 'cd'.repeat(32))));
  await assert.rejects(hexCi(authorization(token, hexSecret.slice(0, -1))));
});

test('bad signature, algorithm, key id, issuer, audience, clock and missing claims are rejected', async () => {
  const token = await signed(base);
  const [header, claims, signature] = token.split('.');
  const changed = `${header}.${claims}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  await assert.rejects(ci(authorization(changed)));
  const hmac = await new SignJWT(base).setProtectedHeader({ alg: 'HS256', kid: 'fixture' })
    .sign(new Uint8Array(32));
  await assert.rejects(ci(authorization(hmac)));
  await assert.rejects(ci(authorization(await signed(base, { kid: 'other' }))));
  await assert.rejects(ci(authorization(await signed(base, { jku: 'https://fixture.invalid/jwks' }))));
  await assert.rejects(ci(authorization(await signed({ ...base, iss: 'https://example.invalid' }))));
  await assert.rejects(ci(authorization(await signed({ ...base, aud: [policy.audience, 'extra'] }))));
  await assert.rejects(ci(authorization(await signed({ ...base, exp: now - 30, iat: now - 90 }))));
  await assert.rejects(ci(authorization(await signed({ ...base, nbf: now + 120 }))));
  await assert.rejects(ci(authorization(await signed({ ...base, jti: undefined }))));
});

test('unapproved repository, caller, reusable workflow, ref, event and runner cannot register', async () => {
  for (const [field, value] of Object.entries({
    repository_id: '124', repository_owner_id: '322', ref: 'refs/pull/3/merge',
    workflow_ref: 'other', job_workflow_ref: 'other', job_workflow_sha: 'b'.repeat(40),
    sub: 'repo:other/app:ref:refs/heads/main', event_name: 'pull_request', runner_environment: 'self-hosted', run_attempt: '',
  })) {
    await assert.rejects(ci(authorization(await signed({ ...base, [field]: value }))), field);
  }
});

test('same-repository release workflows require an exact SHA and reject a different reused job', async () => {
  const { reusableRef, reusableSha, ...directPolicy } = policy;
  const callerSha = base.workflow_sha;
  const environment = 'release-authority-verifier';
  const subject = 'repo:org/app:environment:release-authority-verifier';
  const fixed = makeCiAuthenticator({ ...directPolicy, callerSha, environment, subject }, { resolveKey, equal: timingSafeEqual });
  assert.throws(() => makeCiAuthenticator(directPolicy, { resolveKey }), /Incomplete/);
  const claims = { ...base, sub: subject, environment, job_workflow_ref: undefined, job_workflow_sha: undefined };
  assert.equal((await fixed(authorization(await signed(claims)))).workflowSha, callerSha);
  await assert.rejects(fixed(authorization(await signed({ ...claims, workflow_sha: reusableSha }))));
  await assert.rejects(fixed(authorization(await signed({ ...claims, environment: 'foreign' }))));
  await assert.rejects(fixed(authorization(await signed({ ...claims, job_workflow_ref: reusableRef, job_workflow_sha: reusableSha }))));
});

test('Access requires a valid token scoped to the app and a configured admin subject', async () => {
  const access = makeAccessAuthenticator({ team: 'fixture-team', audience: 'admin-audience', administrators: ['allowed'] }, { resolveKey });
  const admin = { iss: 'https://fixture-team.cloudflareaccess.com', aud: ['admin-audience'], sub: 'allowed', iat: now, exp: now + 240 };
  const accessHeaders = (value) => new Headers({ 'cf-access-jwt-assertion': value });
  assert.equal(await access(accessHeaders(await signed(admin))), 'allowed');
  for (const value of [{ ...admin, sub: 'unknown' }, { ...admin, aud: 'other' }, { ...admin, iss: base.iss }]) {
    await assert.rejects(access(accessHeaders(await signed(value))));
  }
  await assert.rejects(access(accessHeaders('assertion-header-without-jwt')));
});
