export const element = id => document.getElementById(id);
const api = '/api/shop/';
export const number = new Intl.NumberFormat('ja-JP');
export const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });
export const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
export async function request(path, data) {
  const response = await fetch(api + path, {
    method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    ...(data === undefined ? {} : { body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
  });
  if (response.status === 204) return null;
  let result;
  try { result = await response.json(); } catch {
    if (response.ok) throw new Error('temporarily_unavailable');
  }
  if (!response.ok) throw Object.assign(new Error(result?.error ?? 'temporarily_unavailable'), { status: response.status });
  return result;
}

export function rows(id, items, render, empty) {
  const list = element(id);
  list.replaceChildren();
  for (const item of items) {
    const row = document.createElement('li');
    render(row, item);
    list.append(row);
  }
  if (!items.length) {
    const row = document.createElement('li');
    row.className = 'empty';
    row.textContent = empty;
    list.append(row);
  }
}

export function label(tag, text, className) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function openCheckout(value) {
  const url = new URL(value);
  if (url.origin !== 'https://checkout.stripe.com' || url.username || url.password) {
    throw new Error('invalid_checkout');
  }
  location.assign(url.href);
}

const completedOrderStatuses = new Set(['paid', 'refunded', 'payment_failed', 'expired']);

export function forgetCompletedOrders(orders) {
  const completed = new Set(orders.filter(order => completedOrderStatuses.has(order.status)).map(order => order.id));
  if (!completed.size) return;
  for (const key of Object.keys(sessionStorage)) {
    if (!key.startsWith('mane-checkout:')) continue;
    try {
      if (completed.has(JSON.parse(sessionStorage.getItem(key))?.id)) sessionStorage.removeItem(key);
    } catch { /* A malformed checkout reference is ignored. */ }
  }
}
