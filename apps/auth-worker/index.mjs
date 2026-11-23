// Go still issues the signed challenge and verifies the device response.
const challengePath = '/auth/challenge';
const statusPath = '/_internal/scylla-status';
const transient = Symbol('transient');
const staleAfter = 30_000;

function reply(status, error, extra = {}) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
}

async function readJSON(message, limit) {
  const reader = message.body?.getReader();
  if (!reader) throw new Error('missing body');
  const data = new Uint8Array(limit);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(new TextDecoder().decode(data.subarray(0, length)));
      if (length + value.length > limit) throw new Error('body too large');
      data.set(value, length);
      length += value.length;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
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

export function createWorker({ fetchNode = fetch, now = Date.now, random = Math.random,
  hedgeMs = 200, budgetMs = 1_500, nodeTimeoutMs = 700 } = {}) {
  let cached;
  let statusRefresh;
  let nextPoll = 0;
  let poolKey;

  async function ask(node, body, signal) {
    try {
      const answer = await fetchNode(node.origin + challengePath, {
        method: 'POST', body, redirect: 'manual', signal, headers: { 'Content-Type': 'application/json' },
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

  async function route(nodes, body) {
    const attempts = new Map();
    const end = timer(budgetMs, 'deadline');
    let next = 0;
    let hedgeAt = 0;
    function start() {
      const node = nodes[next++];
      const controller = new AbortController();
      const cutoff = timer(nodeTimeoutMs, transient);
      hedgeAt = now() + hedgeMs;
      const result = Promise.race([ask(node, body, controller.signal), cutoff.promise])
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

  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (url.pathname !== challengePath || url.search) return reply(404, 'not found');
      if (request.method !== 'POST') return reply(405, 'method not allowed', { Allow: 'POST' });
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
      if (poolKey !== env.MANE_AUTH_NODES) {
        poolKey = env.MANE_AUTH_NODES;
        nextPoll = 0;
        cached = undefined;
      }
      sample(nodes, env, ctx);
      const up = [], unknown = [];
      for (const node of nodes) {
        const statuses = (cached ?? []).filter(s => now() - s.observed_at_ms < staleAfter)
          .map(s => s.hosts[node.scyllaHostID]).filter(Boolean);
        if (statuses.includes('UN')) up.push(node);
        else if (!statuses.length || !statuses.every(s => /^D[NJLM]$/.test(s))) unknown.push(node);
      }
      const eligible = [...shuffled(up, random), ...shuffled(unknown, random)];
      const started = now();
      const response = await route(eligible.length ? eligible : shuffled(nodes, random), body);
      response.headers.set('Server-Timing', `mane-route;dur=${Math.max(0, now() - started)}`);
      return response;
    },
  };
}
export default createWorker();
