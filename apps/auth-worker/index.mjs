import { shopRequest } from './shop/index.mjs';

// Go still issues the signed challenge and verifies the device response.
const challengePath = '/auth/challenge';
const statusPath = '/_internal/scylla-status';
const issuerHeader = 'X-Mane-Issuer';
const accountRoutes = new Map([
  [challengePath, ['POST', 4096]],
  ['/auth/google', ['POST', 32768]],
  ['/auth/refresh', ['POST', 2048]],
  ['/auth/logout', ['POST', 0]],
  ['/v1/me', ['GET', 0]],
  ['/v1/credits', ['GET', 0]],
]);
const transient = Symbol('transient');
const staleAfter = 30_000;

function reply(status, error, extra = {}) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
}

async function readBody(message, limit) {
  const reader = message.body?.getReader();
  if (!reader) return undefined;
  const data = new Uint8Array(limit);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return data.subarray(0, length);
      if (length + value.length > limit) throw new Error('body too large');
      data.set(value, length);
      length += value.length;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}

async function readJSON(message, limit) {
  return JSON.parse(new TextDecoder().decode(await readBody(message, limit)));
}

function configuredNodes(value, incomingOrigin) {
  const entries = JSON.parse(value);
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 8) throw new Error('invalid nodes');
  const ids = new Set();
  const origins = new Set();
  for (const { id, origin, scyllaHostID } of entries) {
    const url = new URL(origin);
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
        url.protocol !== 'https:' || url.origin !== origin || origin === incomingOrigin ||
        ids.has(id) || origins.has(origin) ||
        (scyllaHostID !== undefined && !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/.test(scyllaHostID))) {
      throw new Error('invalid node');
    }
    ids.add(id);
    origins.add(origin);
  }
  return entries;
}

function shuffled(list, random) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function timer(ms, value) {
  let id;
  const promise = new Promise(resolve => { id = setTimeout(resolve, ms, value); });
  return { promise, cancel: () => clearTimeout(id) };
}

function base64url(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
const textBytes = new TextEncoder();

async function signRequest(key, node, bodyHash, now, path = challengePath) {
  const iat = Math.floor(now() / 1000);
  const header = base64url(textBytes.encode(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: 'mane-worker-v1' })));
  const claims = { iss: 'mane-auth-staging', aud: node.id, iat, exp: iat + 5, jti: crypto.randomUUID(),
    method: 'POST', path, body_sha256: bodyHash };
  const input = header + '.' + base64url(textBytes.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('Ed25519', key, textBytes.encode(input));
  return input + '.' + base64url(signature);
}

export function createWorker({ fetchNode = fetch, now = Date.now, random = Math.random,
  hedgeMs = 200, budgetMs = 1_500, nodeTimeoutMs = 700 } = {}) {
  let cached;
  let statusRefresh;
  let nextPoll = 0;
  let poolKey;
  let signerConfig;
  let signer;

  async function proxyAccount(request, node, path, limit) {
    let body;
    try {
      body = await readBody(request, limit);
      if (path === challengePath) {
        const input = JSON.parse(new TextDecoder().decode(body));
        const route = accountRoutes.get(input?.operation?.path);
        if (!route || [challengePath, '/auth/google'].includes(input.operation.path) || route[0] !== input.operation.method) {
          return reply(400, 'invalid session challenge request');
        }
      }
    } catch {
      return reply(400, 'invalid account request');
    }
    const headers = new Headers();
    for (const name of ['Content-Type', 'Authorization', 'X-Mane-Challenge', 'X-Mane-Request-Id', 'X-Mane-Device-Signature']) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    try {
      const upstream = await fetchNode(node.origin + path, {
        method: request.method, body, headers, redirect: 'manual', signal: AbortSignal.timeout(10_000),
      });
      if ((upstream.status >= 300 && upstream.status < 400) || upstream.status >= 500) {
        void upstream.body?.cancel().catch(() => {});
        return reply(502, 'issuer unavailable');
      }
      const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
      const contentType = upstream.headers.get('Content-Type');
      if (contentType) responseHeaders.set('Content-Type', contentType);
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch {
      return reply(502, 'issuer unavailable');
    }
  }

  async function ask(node, body, signal, key, bodyHash) {
    try {
      const answer = await fetchNode(node.origin + challengePath, {
        method: 'POST', body, redirect: 'manual', signal, headers: {
          'Content-Type': 'application/json',
          'X-Mane-Worker-Proof': await signRequest(key, node, bodyHash, now),
        },
      });
      if ([400, 401, 403].includes(answer.status) && answer.headers.get('content-type')?.includes('application/json')) {
        void answer.body?.cancel().catch(() => {});
        return reply(answer.status, 'challenge rejected');
      }
      if (answer.status !== 200) {
        void answer.body?.cancel().catch(() => {});
        return transient;
      }
      const ticket = await readJSON(answer, 8192);
      if (ticket.issuer_node_id !== node.id || ticket.origin !== node.origin ||
          ticket.expires_in_ms !== 5000 || typeof ticket.challenge !== 'string' ||
          !/^[\w-]+\.[\w-]+$/.test(ticket.challenge) ||
          typeof ticket.request_id !== 'string' || !/^[\w-]{16,128}$/.test(ticket.request_id)) return transient;
      return Response.json(ticket, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return transient;
    }
  }

  async function route(nodes, body, key) {
    const bodyHash = base64url(await crypto.subtle.digest('SHA-256', textBytes.encode(body)));
    const attempts = new Map();
    const end = timer(budgetMs, 'deadline');
    let next = 0;
    let hedgeAt = 0;
    function start() {
      const node = nodes[next++];
      const controller = new AbortController();
      const cutoff = timer(nodeTimeoutMs, transient);
      hedgeAt = now() + hedgeMs;
      const result = Promise.race([ask(node, body, controller.signal, key, bodyHash), cutoff.promise])
        .then(response => ({ id: node.id, response }));
      attempts.set(node.id, { result, abort() { controller.abort(); cutoff.cancel(); } });
    }
    try {
      start();
      while (attempts.size) {
        const canHedge = attempts.size < 2 && next < nodes.length;
        const hedge = canHedge ? timer(Math.max(0, hedgeAt - now()), 'hedge') : undefined;
        const event = await Promise.race([end.promise, ...[...attempts.values()].map(a => a.result),
          ...(hedge ? [hedge.promise] : [])]);
        hedge?.cancel();
        if (event === 'deadline') break;
        if (event === 'hedge') { start(); continue; }
        attempts.get(event.id).abort();
        attempts.delete(event.id);
        if (event.response !== transient) return event.response;
        if (next < nodes.length) start();
      }
      return reply(503, 'challenge unavailable', { 'Retry-After': '1' });
    } finally {
      end.cancel();
      for (const attempt of attempts.values()) attempt.abort();
    }
  }

  function sample(nodes, env, ctx) {
    if (!env.MANE_WORKER_HEALTH_TOKEN || !nodes.some(n => n.scyllaHostID) || now() < nextPoll || statusRefresh) return;
    const key = poolKey;
    nextPoll = now() + 5_000;
    statusRefresh = Promise.allSettled(shuffled(nodes, random).slice(0, 2).map(async node => {
      const answer = await fetchNode(node.origin + statusPath, {
        headers: { Authorization: `Bearer ${env.MANE_WORKER_HEALTH_TOKEN}` }, redirect: 'manual',
        signal: AbortSignal.timeout(800),
      });
      if (!answer.ok) {
        void answer.body?.cancel().catch(() => {});
        throw new Error('no Scylla status');
      }
      const snapshot = await readJSON(answer, 16384);
      if (!Number.isSafeInteger(snapshot.observed_at_ms) || !snapshot.hosts || typeof snapshot.hosts !== 'object' ||
          snapshot.observed_at_ms > now() + 5000 || now() - snapshot.observed_at_ms >= staleAfter) throw new Error('stale status');
      return snapshot;
    })).then(results => {
      const snapshots = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      if (poolKey === key && snapshots.length) cached = snapshots;
    }).finally(() => { statusRefresh = undefined; });
    ctx.waitUntil(statusRefresh);
  }

  function candidates(nodes, env, ctx) {
    if (poolKey !== env.MANE_AUTH_NODES) {
      poolKey = env.MANE_AUTH_NODES;
      nextPoll = 0;
      cached = undefined;
    }
    sample(nodes, env, ctx);
    const up = [], unknown = [];
    for (const node of nodes) {
      const statuses = (cached ?? []).filter(item => now() - item.observed_at_ms < staleAfter)
        .map(item => item.hosts[node.scyllaHostID]).filter(Boolean);
      if (statuses.includes('UN')) up.push(node);
      else if (!statuses.length || !statuses.every(status => /^D[NJLM]$/.test(status))) unknown.push(node);
    }
    return [...shuffled(up, random), ...shuffled(unknown, random)];
  }

  async function workerSigner(env) {
    const configuredKey = env.MANE_WORKER_JWS_PRIVATE_KEY?.trim();
    if (!configuredKey) throw new Error('worker signing key is required');
    if (signerConfig !== configuredKey) {
      const der = Uint8Array.from(atob(configuredKey), c => c.charCodeAt(0));
      const nextSigner = await crypto.subtle.importKey('pkcs8', der, 'Ed25519', false, ['sign']);
      signer = nextSigner;
      signerConfig = configuredKey;
    }
    return signer;
  }

  async function shopBackend(nodes, env, operation, data, trace) {
    const accessID = env.MANE_SHOP_ACCESS_CLIENT_ID?.trim();
    const accessSecret = env.MANE_SHOP_ACCESS_CLIENT_SECRET?.trim();
    if (Boolean(accessID) !== Boolean(accessSecret)) {
      throw new Error('incomplete shop Access credentials');
    }
    const accessHeaders = accessID ? {
      'CF-Access-Client-Id': accessID,
      'CF-Access-Client-Secret': accessSecret,
    } : {};
    const key = await workerSigner(env);
    const path = '/_internal/web-shop/' + operation;
    const body = JSON.stringify(data);
    const bodyHash = base64url(await crypto.subtle.digest('SHA-256', textBytes.encode(body)));
    const deadline = Date.now() + 5500;
    for (const node of nodes) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      let result;
      try {
        const proof = await signRequest(key, node, bodyHash, now, path);
        const response = await fetchNode(node.origin + path, {
          method: 'POST', body, redirect: 'manual', signal: AbortSignal.timeout(Math.min(remaining, 3000)),
          headers: {
            'Content-Type': 'application/json', 'X-Mane-Worker-Proof': proof,
            ...accessHeaders,
          },
        });
        if (!response.headers.get('content-type')?.startsWith('application/json') || response.status >= 500 || response.status === 403) {
          void response.body?.cancel().catch(() => {});
          console.warn('shop upstream', { trace, operation, node: node.id, status: response.status });
          continue;
        }
        if ([401, 404].includes(response.status)) {
          void response.body?.cancel().catch(() => {});
          return null;
        }
        result = { status: response.status, data: await readJSON(response, 192 * 1024) };
      } catch {
        console.warn('shop upstream timeout or invalid response', { trace, operation, node: node.id });
        // A rate-limit increment can be uncertain after a timeout. Fail closed for this request.
        if (operation === 'rate') break;
        continue;
      }
      if (result.status >= 200 && result.status < 300) return result.data;
      if (result.status === 409) throw Object.assign(new Error('order_conflict'), { status: 409 });
      if (result.status === 400 && (operation === 'orders-page' || operation === 'activity-page')) {
        throw Object.assign(new Error('invalid cursor'), { status: 400 });
      }
      throw new Error('shop upstream rejected command');
    }
    throw new Error('no shop node available');
  }

  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const path = url.pathname;
      if (path.startsWith('/api/shop/')) {
        if (env.MANE_WEB_SHOP_ENABLED !== '1' || url.origin !== env.SITE_ORIGIN) return reply(404, 'not found');
        const trace = crypto.randomUUID();
        try {
          const nodes = configuredNodes(env.MANE_AUTH_NODES, url.origin);
          const preferred = candidates(nodes, env, ctx);
          const shopRPC = (operation, data) => shopBackend(preferred, env, operation, data, trace);
          const response = await shopRequest(request, { ...env, shopRPC }, fetchNode);
          if (response.status !== 503) return response;
          return reply(503, 'temporarily_unavailable', { 'Retry-After': '15' });
        } catch (error) {
          if (error?.status === 400) return reply(400, 'invalid_request');
          if (error?.status === 409) return reply(409, 'order_conflict');
          console.warn('shop unavailable', { trace, method: request.method });
          return reply(503, 'temporarily_unavailable', { 'Retry-After': '15' });
        }
      }
      const accountRoute = accountRoutes.get(path);
      if (!accountRoute || url.search || request.url.includes('?')) return reply(404, 'not found');
      const [method, limit] = accountRoute;
      if (request.method !== method) return reply(405, 'method not allowed', { Allow: method });
      const issuer = request.headers.get(issuerHeader);
      if (issuer !== null || path !== challengePath) {
        if (!issuer || !/^[a-zA-Z0-9_-]{1,64}$/.test(issuer)) return reply(400, 'invalid issuer');
        let nodes;
        try {
          nodes = configuredNodes(env.MANE_AUTH_NODES, url.origin);
        } catch {
          return reply(503, 'issuer unavailable');
        }
        const node = nodes.find(candidate => candidate.id === issuer);
        return node ? proxyAccount(request, node, path, limit) : reply(401, 'unknown issuer');
      }
      let body;
      try {
        const input = await readJSON(request, 4096);
        if (input?.operation?.path !== '/auth/google' || input.operation.method !== 'POST' ||
            typeof input.device_public_key !== 'string' || !/^[0-9a-f]{64}$/.test(input.operation.body_sha256) ||
            (input.session_id !== undefined && input.session_id !== '')) return reply(400, 'invalid login challenge request');
        body = JSON.stringify({ operation: input.operation, device_public_key: input.device_public_key });
      } catch {
        return reply(400, 'invalid login challenge request');
      }
      let nodes;
      try {
        nodes = configuredNodes(env.MANE_AUTH_NODES, url.origin);
      } catch {
        return reply(503, 'challenge unavailable');
      }
      const eligible = candidates(nodes, env, ctx);
      const started = now();
      let key;
      try {
        key = await workerSigner(env);
      } catch {
        return reply(503, 'challenge unavailable');
      }
      const response = await route(eligible.length ? eligible : shuffled(nodes, random), body, key);
      response.headers.set('Server-Timing', `mane-route;dur=${Math.max(0, now() - started)}`);
      return response;
    },
  };
}
export default createWorker();
