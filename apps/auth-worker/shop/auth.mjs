import { b64url, callBackend, digest, equal, hash, json, random } from './protocol.mjs';

const sessionCookie = '__Secure-mane-shop';
const stateCookie = '__Secure-mane-oauth';
const cookie = (name, value, seconds) => name + '=' + value + '; Path=/api/shop/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + seconds;
const getCookie = (request, name) => {
  const match = (request.headers.get('Cookie') ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  const value = match?.slice(name.length + 1) ?? '';
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
};
const url = (env, path) => new URL(path, env.SITE_ORIGIN).toString();
const now = () => Math.floor(Date.now() / 1000);
function redirect(location, cookies) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}
const callback = '/api/shop/auth/callback';

export async function startLogin(env) {
  if (!env.GOOGLE_WEB_CLIENT_ID || !env.GOOGLE_WEB_CLIENT_SECRET) return json({ error: 'login_unavailable' }, 503);
  const state = random(), nonce = random(), verifier = random();
  await callBackend(env, 'oauth-put', { key: await hash(state), verifier, nonce });
  const login = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  login.search = new URLSearchParams({
    client_id: env.GOOGLE_WEB_CLIENT_ID, redirect_uri: url(env, callback), response_type: 'code', scope: 'openid',
    state, nonce, code_challenge: b64url(await digest(verifier)), code_challenge_method: 'S256',
  });
  return redirect(login.toString(), [cookie(stateCookie, state, 600)]);
}

export async function finishLogin(request, env, fetcher) {
  const params = new URL(request.url).searchParams;
  const state = getCookie(request, stateCookie);
  const code = params.get('code');
  const fail = () => redirect(url(env, '/shop/?login=failed'), [cookie(stateCookie, '', 0)]);
  if (!state || !code || code.length > 2048 || !equal(state, params.get('state') ?? '')) return fail();
  const attempt = await callBackend(env, 'oauth-claim', { key: await hash(state), claim: crypto.randomUUID() });
  if (!attempt) return fail();
  const exchange = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
    body: new URLSearchParams({
      client_id: env.GOOGLE_WEB_CLIENT_ID, client_secret: env.GOOGLE_WEB_CLIENT_SECRET,
      code, code_verifier: attempt.verifier, grant_type: 'authorization_code', redirect_uri: url(env, callback),
    }),
  });
  if (!exchange.ok) return fail();
  const { id_token: idToken } = await exchange.json();
  if (typeof idToken !== 'string' || idToken.length > 8192) return fail();
  const result = await callBackend(env, 'identity', { id_token: idToken, nonce: attempt.nonce });
  const subject = result?.subject;
  if (typeof subject !== 'string' || !subject || subject.length > 255) return fail();
  const previous = getCookie(request, sessionCookie);
  const token = random(), lifetime = 8 * 60 * 60;
  if (previous) await callBackend(env, 'session-delete', { key: await hash(previous) });
  await callBackend(env, 'session-put', { key: await hash(token), subject });
  return redirect(url(env, '/shop/'), [cookie(stateCookie, '', 0), cookie(sessionCookie, token, lifetime)]);
}

export async function session(request, env) {
  const token = getCookie(request, sessionCookie);
  if (!token) return null;
  return callBackend(env, 'session-get', { key: await hash(token) });
}
export async function logout(request, env) {
  const token = getCookie(request, sessionCookie);
  if (token) await callBackend(env, 'session-delete', { key: await hash(token) });
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie(sessionCookie, '', 0), 'Cache-Control': 'no-store' } });
}

export async function allow(env, key, limit) {
  const end = (Math.floor(now() / 60) + 1) * 60;
  const row = await callBackend(env, 'rate', { key: await hash(key + ':' + end), limit });
  return row.allowed;
}
