import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createWorker } from './index.mjs';
import { encode, hash, hex, hmac } from './protocol.mjs';

function d1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const wrap = values => ({
        bind: (...args) => wrap(args),
        first: async () => statement.get(...values) ?? null,
        run: async () => ({ meta: { changes: statement.run(...values).changes } }),
        all: async () => ({ results: statement.all(...values) }),
      });
      return wrap([]);
    },
  };
}

const site = 'https://dmm.example.test';
const backend = 'https://backend.example.test';
const requestID = '08b9c655-5cc5-4f9a-b701-a1d7b72691b9';
const pack = { id: 'fixture', title: '試験クレジット', amount: 200, credits: 12, validity_seconds: null };
const sessionID = 'cs_test_fixture';
const intentID = 'pi_fixture';
const chargeID = 'ch_fixture';
const accountCookie = 'b'.repeat(43);
const cutoff = () => Math.floor(Date.now() / 1000);
const signed = async (event, secret) => {
  const raw = JSON.stringify(event), ts = cutoff();
  const signature = hex(await hmac(encode(secret), encode(ts + '.' + raw)));
  return [raw, 't=' + ts + ',v1=' + signature];
};

function environment() {
  return {
    SITE_ORIGIN: site, MANE_BACKEND_ORIGIN: backend, MANE_WEB_WORKER_KEY: 'a'.repeat(43),
    GOOGLE_WEB_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_WEB_CLIENT_SECRET: 'fixture',
    STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
    MANE_SHOP_TEST_MODE: '1', MANE_SHOP_PACKS: JSON.stringify([pack]), DB: d1(),
  };
}

const post = (path, body, headers = {}) => new Request(site + '/api/shop/' + path, {
  method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const payHeaders = { Origin: site, Cookie: '__Secure-mane-shop=' + accountCookie };
const event = (kind, id, object) => ({ livemode: false, type: kind, id, data: { object } });

test('valid signed Stripe events grant once, retry after a failed backend write, and reverse after full refund', async () => {
  const env = environment();
  env.MANE_SHOP_TEST_SUBJECT_HASHES = await hash('same-google-sub');
  await env.DB.prepare('INSERT INTO web_sessions VALUES (?, ?, ?)').bind(await hash(accountCookie), 'same-google-sub', cutoff() + 60).run();
  let grants = 0, reversals = 0, created = 0, refused = false, pending = true;
  const charge = { id: chargeID, payment_intent: intentID, amount_refunded: 0, currency: 'jpy',
    livemode: false, paid: true, created: cutoff(), receipt_url: 'https://pay.stripe.com/receipts/test' };
  const intent = { id: intentID, livemode: false, status: 'succeeded', amount_received: pack.amount,
    currency: 'jpy', metadata: { mane_order: requestID }, latest_charge: charge };
  const worker = createWorker(async (uri, options) => {
    const url = new URL(uri);
    if (url.origin === backend) {
      assert.match(options.headers['X-Mane-Web-Signature'], /^\d+\.[\w-]{43}$/);
      const body = JSON.parse(options.body);
      assert.equal(body.subject, 'same-google-sub');
      if (url.pathname.endsWith('/grant')) {
        if (!refused) { refused = true; return Response.json({}, { status: 503 }); }
        assert.equal(body.amount, pack.credits);
        grants++;
      } else if (url.pathname.endsWith('/reverse')) {
        assert.equal(body.order_id, requestID);
        reversals++;
      } else return Response.json({ available_credits: grants && !reversals ? 12 : 0, lots: [], history: [] });
      return Response.json({ applied: true });
    }
    assert.equal(options.headers.get('Authorization'), 'Bearer sk_test_fixture');
    if (url.pathname === '/v1/checkout/sessions') {
      created++;
      assert.equal(options.headers.get('Idempotency-Key'), 'mane-checkout:' + requestID);
      assert.equal(options.body.get('line_items[0][price_data][unit_amount]'), String(pack.amount));
      assert.ok(Number(options.body.get('expires_at')) - cutoff() >= 3500);
      return Response.json({ id: sessionID, url: 'https://checkout.stripe.com/c/pay/test', livemode: false });
    }
    if (url.pathname === '/v1/charges/' + chargeID) return Response.json(charge);
    if (url.pathname === '/v1/payment_intents/' + intentID) return Response.json(intent);
    assert.equal(url.pathname, '/v1/checkout/sessions/' + sessionID);
    return Response.json({ id: sessionID, metadata: { mane_order: requestID }, client_reference_id: requestID,
      livemode: false, mode: 'payment', currency: 'jpy', amount_total: pack.amount, status: 'complete',
      payment_status: pending ? 'unpaid' : 'paid', payment_intent: intent });
  });
  const input = { pack_id: pack.id, request_id: requestID, amount: 1, subject: 'user-input' };
  assert.equal((await worker.fetch(post('checkout', input, { ...payHeaders, Origin: 'https://other.example.test' }), env)).status, 403);
  assert.equal((await worker.fetch(post('checkout', input, { Origin: site }), env)).status, 401);
  assert.equal((await worker.fetch(post('checkout', input, payHeaders), { ...env, MANE_SHOP_TEST_SUBJECT_HASHES: '' })).status, 503);
  assert.equal((await worker.fetch(post('checkout', input, payHeaders), env)).status, 200);
  assert.equal((await worker.fetch(post('checkout', input, payHeaders), env)).status, 200);
  assert.equal(created, 1);
  const send = async payload => {
    const [raw, signature] = await signed(payload, env.STRIPE_WEBHOOK_SECRET);
    return worker.fetch(post('stripe/webhook', raw, { 'Stripe-Signature': signature }), env);
  };
  const paid = event('checkout.session.completed', 'evt_fixture_paid', { id: sessionID });
  const [raw, signature] = await signed(paid, env.STRIPE_WEBHOOK_SECRET);
  assert.equal((await worker.fetch(post('stripe/webhook', raw + ' ', { 'Stripe-Signature': signature }), env)).status, 400);
  assert.equal((await send(event('checkout.session.completed', 'evt_fixture_pending', { id: sessionID }))).status, 200);
  assert.equal(grants, 0);
  pending = false;
  assert.equal((await send(paid)).status, 503);
  assert.equal((await send(paid)).status, 200);
  assert.equal((await send(paid)).status, 200);
  assert.equal(grants, 1);
  charge.amount_refunded = 25;
  await send(event('charge.refunded', 'evt_fixture_partial', { id: chargeID }));
  const read = () => worker.fetch(new Request(site + '/api/shop/account', { headers: payHeaders }), env).then(r => r.json());
  const reviewed = await read();
  assert.equal(reviewed.orders[0].status, 'review_required');
  assert.equal(reviewed.orders[0].amount_refunded, 25);
  assert.equal(reversals, 0);
  assert.equal((await send(event('charge.dispute.created', 'evt_fixture_dispute', { charge: chargeID }))).status, 200);
  assert.equal((await read()).orders[0].status, 'review_required');
  charge.amount_refunded = pack.amount;
  const refund = event('charge.refunded', 'evt_fixture_full', { id: chargeID });
  env.MANE_SHOP_TEST_MODE = '0';
  assert.equal((await send(refund)).status, 200);
  assert.equal((await send(refund)).status, 200);
  assert.equal(reversals, 1);
  assert.equal((await read()).orders[0].status, 'refunded');
  assert.equal((await read()).wallet.available_credits, 0);
  assert.equal((await send(event('checkout.session.completed', 'evt_fixture_late_paid', { id: sessionID }))).status, 200);
  assert.equal(grants, 1);
});

test('Google OAuth callback consumes state once and browser session cookie is secure', async () => {
  const env = environment();
  let exchanges = 0;
  const worker = createWorker(async (uri, options) => {
    if (uri === 'https://oauth2.googleapis.com/token') {
      exchanges++;
      assert.match(options.body.get('code_verifier'), /^[\w-]{43}$/);
      return Response.json({ id_token: 'fixture_google_id_token' });
    }
    assert.equal(uri, backend + '/_internal/web-shop/identity');
    assert.match(JSON.parse(options.body).nonce, /^[\w-]{43}$/);
    return Response.json({ subject: 'same-google-sub' });
  });
  const start = await worker.fetch(new Request(site + '/api/shop/auth/start'), env);
  assert.equal(start.status, 303);
  const target = new URL(start.headers.get('Location'));
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  const cookie = start.headers.get('Set-Cookie').split(';')[0];
  const callback = new Request(site + '/api/shop/auth/callback?code=fixture&state=' + target.searchParams.get('state'),
    { headers: { Cookie: cookie } });
  const login = await worker.fetch(callback, env);
  assert.equal(login.status, 303);
  assert.equal(new URL(login.headers.get('Location')).search, '');
  assert.ok(login.headers.getSetCookie().some(value => /^__Secure-mane-shop=.*; Path=\/api\/shop\/; Secure; HttpOnly; SameSite=Lax;/.test(value)));
  assert.match((await worker.fetch(callback, env)).headers.get('Location'), /login=failed/);
  assert.equal(exchanges, 1);
});

test('an accidental live Stripe key cannot enable purchases', async () => {
  const env = { ...environment(), STRIPE_SECRET_KEY: 'sk_live_fixture' };
  env.MANE_SHOP_TEST_SUBJECT_HASHES = await hash('same-google-sub');
  await env.DB.prepare('INSERT INTO web_sessions VALUES (?, ?, ?)').bind(await hash(accountCookie), 'same-google-sub', cutoff() + 60).run();
  const worker = createWorker(async () => { throw new Error('should not contact a live endpoint'); });
  const result = await worker.fetch(new Request(site + '/api/shop/packs', { headers: payHeaders }), env).then(r => r.json());
  assert.equal(result.checkout_enabled, false);
});
