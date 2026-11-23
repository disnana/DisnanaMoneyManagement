import { allow, finishLogin, logout, session, startLogin } from './auth.mjs';
import { canCheckout, catalog, checkout, reconcile, webhook } from './payments.mjs';
import { callBackend, decode, json, readBytes } from './protocol.mjs';

const prefix = '/api/shop/';
const routes = new Map([
  ['packs', 'GET'], ['auth/start', 'GET'], ['auth/callback', 'GET'], ['auth/logout', 'POST'],
  ['account', 'GET'], ['summary', 'GET'], ['history/orders', 'GET'], ['history/activity', 'GET'],
  ['checkout', 'POST'], ['stripe/webhook', 'POST'], ['node', 'GET'],
]);
const orderRoute = /^orders\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/(reconcile|resume)$/;
const historyRoutes = new Map([['history/orders', 'orders-page'], ['history/activity', 'activity-page']]);

async function storefrontCatalog(env, subject) {
  return { packs: catalog(env), checkout_enabled: await canCheckout(env, subject), test_mode: true };
}

export async function shopRequest(request, env, fetcher) {
  const url = new URL(request.url);
  if (url.origin !== env.SITE_ORIGIN || url.protocol !== 'https:') return json({ error: 'not_found' }, 404);
  const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '';
  const match = orderRoute.exec(path);
  const method = match ? 'POST' : routes.get(path);
  if (!method) return json({ error: 'not_found' }, 404);
  if (request.method !== method) return json({ error: 'method_not_allowed' }, 405);
  const history = historyRoutes.get(path);
  const cursor = url.searchParams.get('cursor');
  const exclude = url.searchParams.get('exclude');
  const validExclusion = path === 'node' && url.searchParams.size === 1 && /^[\w-]{1,64}$/.test(exclude ?? '');
  const cursorPattern = path === 'history/orders' ? /^[0-9]{1,19}:[0-9a-f-]{36}$/ : /^[A-Za-z0-9_-]{39,208}$/;
  if (url.search && path !== 'auth/callback' && !validExclusion &&
      !(history && url.searchParams.size === 1 && cursorPattern.test(cursor ?? ''))) {
    return json({ error: 'invalid_request' }, 400);
  }
  if (path === 'stripe/webhook') return webhook(env, fetcher, request);
  if (method === 'POST' && request.headers.get('Origin') !== env.SITE_ORIGIN) return json({ error: 'origin_rejected' }, 403);
  if (path === 'packs') {
    const user = await session(request, env);
    return json(await storefrontCatalog(env, user?.subject));
  }
  if (path.startsWith('auth/') && method === 'GET') {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!await allow(env, 'auth:' + ip, 15)) return json({ error: 'too_many_requests' }, 429);
    return path === 'auth/start' ? startLogin(env) : finishLogin(request, env, fetcher);
  }
  if (path === 'auth/logout') return logout(request, env);
  if (path === 'node' && !env.shopAssign) return json({ error: 'not_found' }, 404);
  const user = await session(request, env);
  if (!user) return json({ error: 'login_required' }, 401);
  const scope = match ? 'reconcile' : path;
  if (!await allow(env, scope + ':' + user.subject, method === 'GET' ? 30 : 8)) {
    return json({ error: 'too_many_requests' }, 429);
  }
  if (match) return reconcile(env, fetcher, user.subject, match[1], match[2] === 'resume');
  if (path === 'checkout') {
    let input;
    try { input = JSON.parse(decode(await readBytes(request, 4096))); }
    catch { return json({ error: 'invalid_request' }, 400); }
    return checkout(env, fetcher, user.subject, input);
  }
  if (path === 'summary') {
    const wallet = await callBackend(env, 'wallet-summary', { subject: user.subject });
    if (!wallet) return json({ error: 'temporarily_unavailable' }, 503);
    return json({ account_id: user.subject, wallet, catalog: await storefrontCatalog(env, user.subject) });
  }
  if (path === 'node') {
    const direct = await env.shopAssign(user.sessionHash, exclude);
    if (!direct) return json({ error: 'temporarily_unavailable' }, 503);
    return json({ direct: { ...direct, catalog: await storefrontCatalog(env, user.subject) } });
  }
  if (history) {
    const page = await callBackend(env, history, { subject: user.subject, cursor: cursor ?? '' });
    if (!page) return json({ error: 'temporarily_unavailable' }, 503);
    return json({ ...page, resume_supported: history === 'orders-page' && await canCheckout(env, user.subject) });
  }
  const [wallet, orders] = await Promise.all([
    callBackend(env, 'wallet', { subject: user.subject }),
    callBackend(env, 'orders', { subject: user.subject }),
  ]);
  return json({ account_id: user.subject, resume_supported: true, wallet, orders });
}
