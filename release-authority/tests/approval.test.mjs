import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeApprovalHandler } from '../workers/approval/handler.mjs';

const origin = 'https://release.fixture.invalid';
const hash = 'a'.repeat(64);
const id = 'b'.repeat(32);
const nonce = 'c'.repeat(32);
const uri = `${origin}/approve/${id}`;

function fixture() {
  const calls = [];
  const handle = makeApprovalHandler({
    origin,
    async authenticate(headers) {
      if (headers.get('cf-access-jwt-assertion') !== 'fixture-verified-user') throw new Error('Unauthorized fixture');
      return 'fixture-admin';
    },
    assets: {},
    ledger: {
      async approvalView(...args) {
        calls.push(['view', ...args]);
        return { hash, manifest: { packageName: '<img src=x onerror=alert(1)>', versionName: '1.0.0' } };
      },
      async arm(...args) { calls.push(['arm', ...args]); return nonce; },
      async confirm(...args) { calls.push(['confirm', ...args]); },
      async reject(...args) { calls.push(['reject', ...args]); },
    },
  });
  return { calls, handle };
}

const headers = { 'cf-access-jwt-assertion': 'fixture-verified-user' };
function post(path, body, override = {}) {
  return new Request(`${uri}/${path}`, {
    method: 'POST',
    headers: { ...headers, Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', ...override },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('inert page, strict CSP and headers, and HTML escaping', async () => {
  const { calls, handle } = fixture();
  assert.equal((await handle(new Request(uri))).status, 404);
  assert.equal((await handle(new Request(`${uri}/confirm`, { headers }))).status, 404);
  const view = await handle(new Request(uri, { headers }));
  assert.equal(view.status, 200);
  assert.match(view.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(view.headers.get('cache-control'), 'no-store');
  assert.equal(view.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await view.text(), /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.deepEqual(calls, [['view', id, 'fixture-admin']]);
});

test('cross-origin actions and oversized, malformed, duplicate-key or unauthenticated requests are denied', async () => {
  const { calls, handle } = fixture();
  assert.equal((await handle(post('arm', { hash }, { Origin: 'https://foreign.invalid' }))).status, 403);
  assert.equal((await handle(post('arm', { hash }, { 'Sec-Fetch-Site': 'same-site' }))).status, 403);
  assert.equal((await handle(post('arm', { hash }, { 'cf-access-jwt-assertion': 'forged' }))).status, 404);
  assert.equal((await handle(post('arm', 'x'.repeat(1025)))).status, 409);
  assert.equal((await handle(post('arm', `{"hash":"${hash}","hash":"${hash}"}`))).status, 409);
  assert.deepEqual(calls, []);
});

test('same-origin POST passes the verified administrator and bound values to the ledger', async () => {
  const { calls, handle } = fixture();
  const arm = await handle(post('arm', { hash }));
  assert.deepEqual(await arm.json(), { nonce });
  assert.equal((await handle(post('confirm', { hash, nonce }))).status, 204);
  assert.equal((await handle(post('reject', { hash }))).status, 204);
  assert.deepEqual(calls, [
    ['arm', id, hash, 'fixture-admin'], ['confirm', id, hash, 'fixture-admin', nonce],
    ['reject', id, hash, 'fixture-admin'],
  ]);
});
