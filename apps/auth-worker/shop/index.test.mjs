import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorker } from '../index.mjs';
import { encode, hash, hex, hmac } from './protocol.mjs';

const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const [nodeA, nodeB] = [
  { origin: 'https://a.example.test', id: 'staging-a' },
  { origin: 'https://b.example.test', id: 'staging-b' },
];
const privateKey = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64');
const publicFetch = (worker, request, env) => worker.fetch(request, env, { waitUntil() {} });
const backendFixture = () => {
  const sessions = new Map(), states = new Map(), orders = new Map(), events = new Set();
  let granted = 0, reversals = 0;
  return {
    sessions, orders,
    get grants() { return granted; }, get reversals() { return reversals; },
    async dispatch(url, options, node) {
      const [header, body, signature] = options.headers['X-Mane-Worker-Proof'].split('.');
      assert.ok(await crypto.subtle.verify('Ed25519', keys.publicKey, Buffer.from(signature, 'base64url'), encode(header + '.' + body)));
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
      assert.equal(claims.aud, node.id);
      assert.equal(claims.path, url.pathname);
      assert.equal(claims.body_sha256, Buffer.from(await crypto.subtle.digest('SHA-256', encode(options.body))).toString('base64url'));
      assert.equal(options.headers['CF-Access-Client-Id'], 'access-id-fixture');
      assert.equal(options.headers['CF-Access-Client-Secret'], 'access-secret-fixture');
      const input = JSON.parse(options.body);
      const order = orders.get(input.order?.id);
      const found = data => data ? Response.json(data) : Response.json({}, { status:404 });
      switch (url.pathname.split('/').at(-1)) {
        case 'rate': return Response.json({ allowed:true });
        case 'oauth-put': states.set(input.key, input); return Response.json({});
        case 'oauth-claim': {
          const state = states.get(input.key);
          if (state && (!state.claim || state.claim === input.claim)) {
            state.claim = input.claim;
            return Response.json(state);
          }
          return found(null);
        }
        case 'identity': return Response.json({subject:'same-google-sub'});
        case 'session-put': sessions.set(input.key, {subject:input.subject}); return Response.json({});
        case 'session-get': return found(sessions.get(input.key));
        case 'session-delete': sessions.delete(input.key); return Response.json({});
        case 'event-get': return found(events.has(input.key) ? {} : null);
        case 'event-put': events.add(input.key); return Response.json({});
        case 'order-get': return found(order && (!input.order.subject || order.subject === input.order.subject) ? order : null);
        case 'order-create': {
          if (order && order.subject !== input.order.subject) return Response.json({}, {status:409});
          if (!order) orders.set(input.order.id, {...input.order,status:'pending',created_at:cutoff()});
          return Response.json(orders.get(input.order.id));
        }
        case 'order-checkout': Object.assign(order,input.order); return Response.json(order);
        case 'order-apply': {
          assert.equal(input.order.amount, order.amount);
          if (order.status === 'refunded') return Response.json(order);
          if (input.action === 'grant' && order.status !== 'paid' && order.status !== 'review_required') {
            granted++;
            order.status = 'paid';
          }
          if (input.action === 'refund') { reversals++; order.status = 'refunded'; }
          if (input.action === 'review') order.status = 'review_required';
          order.amount_refunded = input.order.amount_refunded ?? 0;
          return Response.json(order);
        }
        case 'orders': return Response.json([...orders.values()].filter(order => order.subject === input.subject));
        case 'wallet': return Response.json({available_credits:granted && !reversals ? 12 : 0,lots:[],history:[]});
        default: assert.fail('unknown operation');
      }
    },
  };
};

const site = 'https://dmm.example.test';
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
    SITE_ORIGIN: site, MANE_WEB_SHOP_ENABLED: '1', MANE_AUTH_NODES: JSON.stringify([nodeA,nodeB]),
    MANE_WORKER_JWS_PRIVATE_KEY: privateKey, MANE_SHOP_ACCESS_CLIENT_ID: 'access-id-fixture',
    MANE_SHOP_ACCESS_CLIENT_SECRET: 'access-secret-fixture',
    GOOGLE_WEB_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_WEB_CLIENT_SECRET: 'fixture',
    STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
    MANE_SHOP_TEST_MODE: '1', MANE_SHOP_PACKS: JSON.stringify([pack]),
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
  const db = backendFixture();
  db.sessions.set(await hash(accountCookie), {subject:'same-google-sub'});
  let created = 0, outage = false, pending = true, usedB = false;
  const charge = { id: chargeID, payment_intent: intentID, amount_refunded: 0, currency: 'jpy',
    livemode: false, paid: true, created: cutoff(), receipt_url: 'https://pay.stripe.com/receipts/test' };
  const intent = { id: intentID, livemode: false, status: 'succeeded', amount_received: pack.amount,
    currency: 'jpy', metadata: { mane_order: requestID }, latest_charge: charge };
  const worker = createWorker({ random:() => 0.9, fetchNode:async (uri, options) => {
    const url = new URL(uri);
    const node = [nodeA,nodeB].find(item => item.origin === url.origin);
    if (node) {
      if (outage && url.pathname.endsWith('/order-apply')) return Response.json({}, { status: 503 });
      if (url.pathname.endsWith('/order-apply') && node === nodeA) return new Response('', { status: 503 });
      if (node === nodeB) usedB = true;
      return db.dispatch(url, options, node);
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
  } });
  const input = { pack_id: pack.id, request_id: requestID, amount: 1, subject: 'user-input' };
  assert.equal((await publicFetch(worker, post('checkout', input, { ...payHeaders, Origin: 'https://other.example.test' }), env)).status, 403);
  assert.equal((await publicFetch(worker, post('checkout', input, { Origin: site }), env)).status, 401);
  assert.equal((await publicFetch(worker, post('checkout', input, payHeaders), { ...env, MANE_SHOP_TEST_SUBJECT_HASHES: '' })).status, 503);
  assert.equal((await publicFetch(worker, post('checkout', input, payHeaders), env)).status, 200);
  assert.equal((await publicFetch(worker, post('checkout', input, payHeaders), env)).status, 200);
  assert.equal(created, 1);
  const send = async payload => {
    const [raw, signature] = await signed(payload, env.STRIPE_WEBHOOK_SECRET);
    return publicFetch(worker, post('stripe/webhook', raw, { 'Stripe-Signature': signature }), env);
  };
  const paid = event('checkout.session.completed', 'evt_fixture_paid', { id: sessionID });
  const [raw, signature] = await signed(paid, env.STRIPE_WEBHOOK_SECRET);
  assert.equal((await publicFetch(worker, post('stripe/webhook', raw + ' ', { 'Stripe-Signature': signature }), env)).status, 400);
  assert.equal((await send(event('checkout.session.completed', 'evt_fixture_pending', { id: sessionID }))).status, 200);
  assert.equal(db.grants, 0);
  pending = false;
  outage = true;
  assert.equal((await send(paid)).status, 503);
  outage = false;
  const reconcilePath = 'orders/' + requestID + '/reconcile';
  assert.equal((await publicFetch(worker, post(reconcilePath, {}, {Origin:site}), env)).status, 401);
  const otherToken = 'x'.repeat(43);
  db.sessions.set(await hash(otherToken), {subject:'different-user'});
  const otherHeaders = {Origin:site,Cookie:'__Secure-mane-shop='+otherToken};
  assert.equal((await publicFetch(worker, post(reconcilePath, {}, otherHeaders), env)).status, 404);
  const checked = await publicFetch(worker, post(reconcilePath, {}, payHeaders), env);
  assert.deepEqual(await checked.json(), {status:'paid'});
  assert.equal((await send(paid)).status, 200);
  assert.equal((await send(paid)).status, 200);
  assert.equal(db.grants, 1);
  assert.equal(usedB, true);
  charge.amount_refunded = 25;
  await send(event('charge.refunded', 'evt_fixture_partial', { id: chargeID }));
  const read = () => publicFetch(worker, new Request(site + '/api/shop/account', { headers: payHeaders }), env).then(r => r.json());
  const reviewed = await read();
  assert.equal(reviewed.orders[0].status, 'review_required');
  assert.equal(reviewed.orders[0].amount_refunded, 25);
  assert.equal(db.reversals, 0);
  assert.equal((await send(event('charge.dispute.created', 'evt_fixture_dispute', { charge: chargeID }))).status, 200);
  assert.equal((await read()).orders[0].status, 'review_required');
  charge.amount_refunded = pack.amount;
  const refund = event('charge.refunded', 'evt_fixture_full', { id: chargeID });
  env.MANE_SHOP_TEST_MODE = '0';
  assert.equal((await send(refund)).status, 200);
  assert.equal((await send(refund)).status, 200);
  assert.equal(db.reversals, 1);
  assert.equal((await read()).orders[0].status, 'refunded');
  assert.equal((await read()).wallet.available_credits, 0);
  assert.equal((await send(event('checkout.session.completed', 'evt_fixture_late_paid', { id: sessionID }))).status, 200);
  assert.equal(db.grants, 1);
});

test('Google OAuth callback consumes state once and browser session cookie is secure', async () => {
  const env = environment();
  const db = backendFixture();
  let exchanges = 0;
  let nodeOnline = nodeA;
  const worker = createWorker({random:() => 0.9, fetchNode:async (uri, options) => {
    if (uri === 'https://oauth2.googleapis.com/token') {
      exchanges++;
      assert.match(options.body.get('code_verifier'), /^[\w-]{43}$/);
      return Response.json({ id_token: 'fixture_google_id_token' });
    }
    const url = new URL(uri);
    if (url.origin !== nodeOnline.origin) return new Response(null, {status:503});
    return db.dispatch(url, options, nodeOnline);
  }});
  const start = await publicFetch(worker, new Request(site + '/api/shop/auth/start'), env);
  assert.equal(start.status, 303);
  const target = new URL(start.headers.get('Location'));
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  const cookie = start.headers.get('Set-Cookie').split(';')[0];
  const callback = new Request(site + '/api/shop/auth/callback?code=fixture&state=' + target.searchParams.get('state'),
    { headers: { Cookie: cookie } });
  nodeOnline = nodeB;
  const login = await publicFetch(worker, callback, env);
  assert.equal(login.status, 303);
  assert.equal(new URL(login.headers.get('Location')).search, '');
  assert.ok(login.headers.getSetCookie().some(value => /^__Secure-mane-shop=.*; Path=\/api\/shop\/; Secure; HttpOnly; SameSite=Lax;/.test(value)));
  assert.match((await publicFetch(worker, callback, env)).headers.get('Location'), /login=failed/);
  assert.equal(exchanges, 1);
});

test('an accidental live Stripe key cannot enable purchases', async () => {
  const env = { ...environment(), STRIPE_SECRET_KEY: 'sk_live_fixture' };
  env.MANE_SHOP_TEST_SUBJECT_HASHES = await hash('same-google-sub');
  const db = backendFixture();
  db.sessions.set(await hash(accountCookie), {subject:'same-google-sub'});
  const worker = createWorker({random:() => 0.9, fetchNode:async (uri, options) => {
    const url = new URL(uri);
    assert.equal(url.origin, nodeA.origin);
    return db.dispatch(url, options, nodeA);
  }});
  const result = await publicFetch(worker, new Request(site + '/api/shop/packs', { headers: payHeaders }), env).then(r => r.json());
  assert.equal(result.checkout_enabled, false);
});
