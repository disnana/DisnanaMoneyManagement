import { callBackend, decode, encode, equal, hash, hex, hmac, json, readBytes } from './protocol.mjs';

const unix = () => Math.floor(Date.now() / 1000);
const checkoutLifetime = 60 * 60;
const minimumCheckoutLifetime = 30 * 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const stripeID = /^([a-z]+_)[a-zA-Z0-9_]{5,255}$/;
const stripeTestAvailable = env => /^(sk|rk)_test_[a-zA-Z0-9_]+$/.test(env.STRIPE_SECRET_KEY ?? '') &&
  /^whsec_[a-zA-Z0-9_]+$/.test(env.STRIPE_WEBHOOK_SECRET ?? '');

export function packs(env) {
  const entries = JSON.parse(env.MANE_SHOP_PACKS ?? '[]');
  if (!Array.isArray(entries) || entries.length > 16) throw new Error('invalid pack configuration');
  const ids = new Set();
  for (const { id, title, amount, credits, validity_seconds } of entries) {
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(id) || ids.has(id) || typeof title !== 'string' ||
        !title.trim() || title.length > 80 || !Number.isSafeInteger(amount) || amount <= 0 ||
        !Number.isSafeInteger(credits) || credits <= 0 ||
        (validity_seconds !== null && (!Number.isSafeInteger(validity_seconds) || validity_seconds <= 0))) {
      throw new Error('invalid pack configuration');
    }
    ids.add(id);
  }
  return entries;
}

async function stripe(env, fetcher, path, form, idempotency) {
  if (!stripeTestAvailable(env)) throw new Error('Stripe test configuration unavailable');
  const headers = new Headers({ Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY });
  if (idempotency) headers.set('Idempotency-Key', idempotency);
  const response = await fetcher('https://api.stripe.com/v1' + path, {
    headers, method: form ? 'POST' : 'GET', body: form, redirect: 'error', signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error('Stripe request failed (' + response.status + ')');
  return response.json();
}

function trustedURL(value, host) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.host === host && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

const findOrder = (env, id) => env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();

export async function checkout(env, fetcher, user, input) {
  if (!await canCheckout(env, user)) return json({ error: 'sales_unavailable' }, 503);
  if (!uuid.test(input?.request_id ?? '')) return json({ error: 'invalid_request' }, 400);
  const pack = packs(env).find(item => item.id === input.pack_id);
  if (!pack) return json({ error: 'pack_unavailable' }, 400);
  await env.DB.prepare(`INSERT INTO orders
    (id, subject, pack, title, amount, credits, validity_seconds, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT(id) DO NOTHING`)
    .bind(input.request_id, user, pack.id, pack.title, pack.amount, pack.credits, pack.validity_seconds, unix()).run();
  const order = await findOrder(env, input.request_id);
  if (!order || order.subject !== user || order.pack !== pack.id || order.status !== 'pending') return json({ error: 'order_conflict' }, 409);
  const expires = order.created_at + checkoutLifetime;
  const remaining = expires - unix();
  if (order.checkout_url && remaining > 0) return json({ checkout_url: order.checkout_url });
  if (remaining <= minimumCheckoutLifetime) return json({ error: 'order_expired' }, 409);
  const site = env.SITE_ORIGIN;
  // Use the stored order, so retries are stable even if the pack is edited.
  const form = new URLSearchParams({
    mode: 'payment',
    expires_at: String(expires),
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'jpy',
    'line_items[0][price_data][unit_amount]': String(order.amount),
    'line_items[0][price_data][product_data][name]': order.title,
    client_reference_id: order.id,
    'metadata[mane_order]': order.id,
    'payment_intent_data[metadata][mane_order]': order.id,
    success_url: site + '/shop/?checkout=returned',
    cancel_url: site + '/shop/?checkout=canceled',
  });
  const session = await stripe(env, fetcher, '/checkout/sessions', form, 'mane-checkout:' + order.id);
  const url = trustedURL(session.url, 'checkout.stripe.com');
  if (!url || session.livemode !== false || !stripeID.test(session.id ?? '')) throw new Error('invalid Checkout response');
  const update = await env.DB.prepare("UPDATE orders SET stripe_session = ?, checkout_url = ? WHERE id = ? AND status = 'pending' AND (stripe_session IS NULL OR stripe_session = ?)")
    .bind(session.id, url, order.id, session.id).run();
  if (!update.meta.changes) return json({ error: 'order_conflict' }, 409);
  return json({ checkout_url: url });
}

export async function validWebhook(raw, header, secret, at = unix()) {
  if (!header || header.length > 2048 || !secret) return false;
  const signatures = header.split(',').map(part => part.trim());
  const stamp = signatures.find(part => part.startsWith('t='))?.slice(2) ?? '';
  if (!/^\d{10}$/.test(stamp) || Math.abs(at - Number(stamp)) > 300) return false;
  const prefix = encode(stamp + '.');
  const message = new Uint8Array(prefix.length + raw.length);
  message.set(prefix);
  message.set(raw, prefix.length);
  const expected = hex(await hmac(encode(secret), message));
  return signatures.some(part => part.startsWith('v1=') && equal(part.slice(3), expected));
}

async function refund(env, fetcher, order, refunded, paymentIntent) {
  await env.DB.prepare(`UPDATE orders SET status = 'refund_pending', amount_refunded = ?, payment_intent = ?, checkout_url = NULL
    WHERE id = ? AND status <> 'refunded'`).bind(refunded, paymentIntent, order.id).run();
  await callBackend(env, 'reverse', { subject: order.subject, order_id: order.id }, fetcher);
  await env.DB.prepare("UPDATE orders SET status = 'refunded' WHERE id = ? AND status = 'refund_pending'").bind(order.id).run();
}

async function review(env, order, refunded, paymentIntent) {
  await env.DB.prepare(`UPDATE orders SET status = 'review_required', amount_refunded = MAX(amount_refunded, ?),
    payment_intent = ?, checkout_url = NULL WHERE id = ? AND status NOT IN ('refunded', 'refund_pending')`)
    .bind(refunded, paymentIntent, order.id).run();
}

async function settle(env, fetcher, order, sessionID, intent, charge) {
  if (intent.status !== 'succeeded' || intent.amount_received !== order.amount || intent.currency !== 'jpy' ||
      intent.metadata?.mane_order !== order.id || intent.livemode !== false || !charge ||
      charge.payment_intent !== intent.id || charge.livemode !== false || !charge.paid ||
      !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > order.amount) {
    throw new Error('invalid payment state');
  }
  if (charge.amount_refunded === order.amount) return refund(env, fetcher, order, charge.amount_refunded, intent.id);
  if (charge.amount_refunded > 0 || charge.disputed) return review(env, order, charge.amount_refunded, intent.id);
  await env.DB.prepare(`UPDATE orders SET status = 'fulfillment_pending', payment_intent = ?, stripe_session = ?, receipt_url = ?,
    checkout_url = NULL WHERE id = ? AND status IN ('pending', 'payment_failed', 'fulfillment_pending')
    AND (stripe_session IS NULL OR stripe_session = ?)`)
    .bind(intent.id, sessionID, trustedURL(charge.receipt_url, 'pay.stripe.com'), order.id, sessionID).run();
  const current = await findOrder(env, order.id);
  if (current.status !== 'fulfillment_pending' || current.stripe_session !== sessionID) return;
  const expires = order.validity_seconds === null ? 0 : (charge.created + order.validity_seconds) * 1000;
  if (!Number.isSafeInteger(expires) || expires < 0) throw new Error('invalid expiration');
  await callBackend(env, 'grant', { subject: order.subject, order_id: order.id, amount: order.credits, expires_at_ms: expires }, fetcher);
  await env.DB.prepare("UPDATE orders SET status = 'paid' WHERE id = ? AND status = 'fulfillment_pending'").bind(order.id).run();
}

const sessionEvents = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
]);

async function onCheckout(env, fetcher, event) {
  const id = event.data?.object?.id;
  if (!stripeID.test(id ?? '')) return;
  const session = await stripe(env, fetcher, '/checkout/sessions/' + id + '?expand%5B%5D=payment_intent.latest_charge');
  const orderID = session.metadata?.mane_order;
  if (!uuid.test(orderID ?? '')) return;
  const order = await findOrder(env, orderID);
  if (!order) return;
  if (session.id !== id || session.client_reference_id !== order.id || session.livemode !== false ||
      session.mode !== 'payment' || session.currency !== 'jpy' || session.amount_total !== order.amount ||
      (order.stripe_session && order.stripe_session !== id)) throw new Error('Checkout order mismatch');
  if (session.payment_status === 'paid' && session.status === 'complete' && session.payment_intent) {
    return settle(env, fetcher, order, session.id, session.payment_intent, session.payment_intent.latest_charge);
  }
  const failure = session.status === 'expired' ? 'expired' :
    event.type === 'checkout.session.async_payment_failed' ? 'payment_failed' : null;
  if (failure) await env.DB.prepare("UPDATE orders SET status = ?, checkout_url = NULL WHERE id = ? AND status = 'pending'").bind(failure, order.id).run();
}

const chargeEvents = new Set(['charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed']);
async function onCharge(env, fetcher, event) {
  const object = event.data?.object;
  const id = event.type === 'charge.refunded' ? object?.id : object?.charge;
  if (!stripeID.test(id ?? '')) return;
  const charge = await stripe(env, fetcher, '/charges/' + id);
  if (charge.id !== id || charge.livemode !== false || !stripeID.test(charge.payment_intent ?? '')) return;
  const intent = await stripe(env, fetcher, '/payment_intents/' + charge.payment_intent);
  const orderID = intent.metadata?.mane_order;
  if (!uuid.test(orderID ?? '')) return;
  const order = await findOrder(env, orderID);
  if (!order) return;
  if (intent.id !== charge.payment_intent || intent.livemode !== false || intent.currency !== 'jpy' ||
      intent.amount_received !== order.amount || !charge.paid || charge.currency !== 'jpy' ||
      !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > order.amount ||
      (order.payment_intent && order.payment_intent !== intent.id)) throw new Error('payment order mismatch');
  if (charge.amount_refunded === order.amount) return refund(env, fetcher, order, charge.amount_refunded, intent.id);
  if (charge.amount_refunded > 0 || event.type.startsWith('charge.dispute.')) {
    await review(env, order, charge.amount_refunded, intent.id);
  }
}

export async function webhook(env, fetcher, request) {
  if (!stripeTestAvailable(env)) return json({ error: 'sales_unavailable' }, 503);
  let event;
  try {
    const raw = await readBytes(request, 65536);
    if (!await validWebhook(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET)) {
      return json({ error: 'invalid_signature' }, 400);
    }
    event = JSON.parse(decode(raw));
  } catch {
    return json({ error: 'invalid_event' }, 400);
  }
  if (event.livemode !== false || !stripeID.test(event.id ?? '')) return json({ error: 'invalid_event' }, 400);
  const handled = await env.DB.prepare('SELECT id FROM stripe_events WHERE id = ?').bind(event.id).first();
  if (handled) return json({ received: true });
  if (sessionEvents.has(event.type)) await onCheckout(env, fetcher, event);
  else if (chargeEvents.has(event.type)) await onCharge(env, fetcher, event);
  else return json({ received: true });
  await env.DB.prepare('INSERT INTO stripe_events VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(event.id, event.type, unix()).run();
  return json({ received: true });
}

export function catalog(env) {
  return packs(env).map(({ id, title, amount, credits, validity_seconds }) => ({ id, title, amount, credits, validity_seconds }));
}
export async function canCheckout(env, subject) {
  if (env.MANE_SHOP_TEST_MODE !== '1' || !stripeTestAvailable(env) || !subject) return false;
  const subjectHash = await hash(subject);
  return (env.MANE_SHOP_TEST_SUBJECT_HASHES ?? '').split(',').map(x => x.trim()).includes(subjectHash);
}

export async function reconcile(env, fetcher) {
  if (!stripeTestAvailable(env)) return;
  const time = unix();
  const pending = "status IN ('fulfillment_pending', 'refund_pending') AND retry_at <= ?";
  const { results } = await env.DB.prepare("SELECT * FROM orders WHERE " + pending + " ORDER BY retry_at, created_at LIMIT 20").bind(time).all();
  const work = results.map(async order => {
    const claim = await env.DB.prepare("UPDATE orders SET retry_at = ? WHERE id = ? AND " + pending)
      .bind(time + 600, order.id, time).run();
    if (!claim.meta.changes) return;
    if (order.status === 'refund_pending') return refund(env, fetcher, order, order.amount_refunded, order.payment_intent);
    return onCheckout(env, fetcher, { type: 'checkout.session.completed', data: { object: { id: order.stripe_session } } });
  });
  await Promise.allSettled(work);
}
