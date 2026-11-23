import { allow, finishLogin, logout, session, startLogin } from './auth.mjs';
import { canCheckout, catalog, checkout, reconcile, webhook } from './payments.mjs';
import { callBackend, decode, json, readBytes } from './protocol.mjs';

const prefix = '/api/shop/';
const routes = new Map([
  ['packs', 'GET'], ['auth/start', 'GET'], ['auth/callback', 'GET'], ['auth/logout', 'POST'],
  ['account', 'GET'], ['checkout', 'POST'], ['stripe/webhook', 'POST'],
]);
const seconds = () => Math.floor(Date.now() / 1000);

export function createWorker(fetcher = fetch) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.origin !== env.SITE_ORIGIN || url.protocol !== 'https:') return json({ error: 'not_found' }, 404);
      const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '';
      const method = routes.get(path);
      if (!method) return json({ error: 'not_found' }, 404);
      if (request.method !== method) return json({ error: 'method_not_allowed' }, 405);
      if (url.search && path !== 'auth/callback') return json({ error: 'invalid_request' }, 400);
      try {
        if (path === 'stripe/webhook') return await webhook(env, fetcher, request);
        if (method === 'POST' && request.headers.get('Origin') !== env.SITE_ORIGIN) return json({ error: 'origin_rejected' }, 403);
        if (path === 'packs') {
          const user = await session(request, env);
          return json({ packs: catalog(env), checkout_enabled: await canCheckout(env, user?.subject), test_mode: true });
        }
        if (path.startsWith('auth/') && method === 'GET') {
          const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
          if (!await allow(env, 'auth:' + ip, 15)) return json({ error: 'too_many_requests' }, 429);
          return path === 'auth/start' ? await startLogin(env) : await finishLogin(request, env, fetcher);
        }
        if (path === 'auth/logout') return await logout(request, env);
        const user = await session(request, env);
        if (!user) return json({ error: 'login_required' }, 401);
        if (!await allow(env, path + ':' + user.subject, path === 'checkout' ? 8 : 30)) return json({ error: 'too_many_requests' }, 429);
        if (path === 'checkout') {
          let input;
          try { input = JSON.parse(decode(await readBytes(request, 4096))); }
          catch { return json({ error: 'invalid_request' }, 400); }
          return await checkout(env, fetcher, user.subject, input);
        }
        const [wallet, orders] = await Promise.all([
          callBackend(env, 'wallet', { subject: user.subject }, fetcher),
          env.DB.prepare(`SELECT id, title, amount, credits, status, receipt_url, amount_refunded, created_at
            FROM orders WHERE subject = ? ORDER BY created_at DESC LIMIT 50`).bind(user.subject).all(),
        ]);
        return json({ wallet, orders: orders.results });
      } catch {
        return json({ error: 'temporarily_unavailable' }, 503);
      }
    },
    async scheduled(_event, env) {
      const time = seconds();
      await Promise.allSettled([
        env.DB.batch([
          env.DB.prepare('DELETE FROM oauth_attempts WHERE expires_at <= ?').bind(time),
          env.DB.prepare('DELETE FROM web_sessions WHERE expires_at <= ?').bind(time),
          env.DB.prepare('DELETE FROM rate_windows WHERE expires_at <= ?').bind(time),
        ]),
        reconcile(env, fetcher),
      ]);
    },
  };
}

export default createWorker();
