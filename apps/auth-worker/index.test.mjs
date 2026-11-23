import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorker } from './index.mjs';

const nodeA = { id: 'staging-a', origin: 'https://a.example.test', scyllaHostID: '20ababab-0167-4c4b-a290-6d561b671cee' };
const nodeB = { id: 'staging-b', origin: 'https://b.example.test', scyllaHostID: 'c268fb05-e07f-4d36-b906-a65bdf96bb1d' };
const endpoint = 'https://router.example.test/auth/challenge';
const input = { operation: { method: 'POST', path: '/auth/google', body_sha256: 'a'.repeat(64) }, device_public_key: 'fixture' };
const env = { MANE_AUTH_NODES: JSON.stringify([nodeA, nodeB]) };

function ticket(node) {
  return Response.json({ issuer_node_id: node.id, origin: node.origin, challenge: 'abc.xyz', request_id: 'a'.repeat(32), expires_in_ms: 5000 });
}

function incoming(body = input) {
  return new Request(endpoint, { method: 'POST', body: JSON.stringify(body) });
}

function stage(fetchNode, options) {
  return createWorker({ fetchNode, random: () => 0.9, hedgeMs: 20, budgetMs: 400, nodeTimeoutMs: 100, ...options });
}

test('fast first node receives the only request', async () => {
  const calls = [];
  const worker = stage(async (url, options) => {
    calls.push(url);
    assert.deepEqual(JSON.parse(options.body), input);
    assert.equal(options.redirect, 'manual');
    return ticket(nodeA);
  });
  const response = await worker.fetch(incoming(), env);
  assert.deepEqual(calls, [nodeA.origin + '/auth/challenge']);
  assert.equal((await response.json()).issuer_node_id, nodeA.id);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('server-timing'), /^mane-route;dur=\d+$/);
});

test('slow first node is canceled after the hedge succeeds', async () => {
  const calls = [];
  let canceled = false;
  const worker = stage(async (url, { signal }) => {
    calls.push(url);
    if (url.startsWith(nodeB.origin)) return ticket(nodeB);
    return new Promise((_, reject) => signal.addEventListener('abort', () => {
      canceled = true;
      reject(signal.reason);
    }));
  });
  assert.equal((await (await worker.fetch(incoming(), env)).json()).issuer_node_id, nodeB.id);
  assert.equal(canceled, true);
  assert.deepEqual(calls, [nodeA.origin + '/auth/challenge', nodeB.origin + '/auth/challenge']);
});

test('5xx and unexpected issuer fall through once per configured node', async () => {
  const calls = [];
  const worker = stage(async url => {
    calls.push(url);
    return url.startsWith(nodeA.origin) ? new Response(null, { status: 502 }) : ticket(nodeA);
  });
  const response = await worker.fetch(incoming(), env);
  assert.equal(response.status, 503);
  assert.equal(calls.length, 2);
  assert.equal(new Set(calls).size, 2);
});

test('the whole request stops even if an upstream ignores cancellation', async () => {
  const worker = stage(() => new Promise(() => {}), { hedgeMs: 5, budgetMs: 35, nodeTimeoutMs: 500 });
  assert.equal((await worker.fetch(incoming(), env)).status, 503);
});

test('Go input errors stop retries, and the Worker only routes login and allowed origins', async () => {
  let calls = 0;
  const worker = stage(async () => { calls++; return Response.json({ error: 'Bad Request' }, { status: 400 }); });
  assert.equal((await worker.fetch(incoming(), env)).status, 400);
  assert.equal((await worker.fetch(incoming({ ...input, operation: { ...input.operation, path: '/auth/refresh' } }), env)).status, 400);
  assert.equal((await worker.fetch(new Request(endpoint), env)).status, 405);
  assert.equal((await worker.fetch(incoming(), { MANE_AUTH_NODES: '[{"id":"loop","origin":"https://router.example.test"}]' })).status, 503);
  assert.equal(calls, 1);
});

test('cached nodetool views skip DN, expire, and rely on routing when views are unavailable', async () => {
  let clock = 1_000_000;
  const requests = [];
  const background = [];
  const token = 'test'.repeat(8);
  const worker = stage(async (url, options) => {
    if (url.endsWith('/_internal/scylla-status')) {
      assert.equal(options.headers.Authorization, 'Bearer ' + token);
      return Response.json({ observed_at_ms: 1_000_000, hosts: { [nodeA.scyllaHostID]: 'DN', [nodeB.scyllaHostID]: 'UN' } });
    }
    assert.equal(options.headers.Authorization, undefined);
    requests.push(url);
    return ticket(url.startsWith(nodeA.origin) ? nodeA : nodeB);
  }, { now: () => clock });
  const config = { ...env, MANE_WORKER_HEALTH_TOKEN: token };
  const ctx = { waitUntil: promise => background.push(promise) };
  await worker.fetch(incoming(), config, ctx);
  await Promise.all(background.splice(0));
  await worker.fetch(incoming(), config, ctx);
  clock += 40_000;
  await worker.fetch(incoming(), config, ctx);
  await Promise.all(background.splice(0));
  assert.deepEqual(requests.map(url => new URL(url).origin), [nodeA.origin, nodeB.origin, nodeA.origin]);
});
