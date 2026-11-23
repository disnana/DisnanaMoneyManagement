const element = id => document.getElementById(id);
const api = '/api/shop/';
const status = element('status');
const params = new URLSearchParams(location.search);
const returned = params.get('checkout');
const loginFailed = params.get('login') === 'failed';
if (returned || loginFailed) history.replaceState(null, '', location.pathname);

const number = new Intl.NumberFormat('ja-JP');
const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });
const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
const orderStatus = {
  pending: '決済待ち', payment_failed: '決済失敗', paid: '付与済み', expired: '決済期限切れ',
  fulfillment_pending: '支払い確認済み・付与中', refunded: '返金済み', refund_pending: '返金反映中',
  review_required: '確認中',
};
const activity = { grant: '付与', spend: '消費', reverse: '返金に伴う引き戻し' };
const orderFeedback = new Map();

function validFor(seconds) {
  if (seconds === null) return '無期限';
  if (seconds % 86400 === 0) return number.format(seconds / 86400) + '日間有効';
  if (seconds % 3600 === 0) return number.format(seconds / 3600) + '時間有効';
  return number.format(seconds / 60) + '分間有効';
}

async function request(path, data) {
  const response = await fetch(api + path, {
    method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    ...(data === undefined ? {} : { body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
  });
  if (response.status === 204) return null;
  let result;
  try { result = await response.json(); } catch { throw new Error('temporarily_unavailable'); }
  if (!response.ok) throw new Error(result?.error ?? 'temporarily_unavailable');
  return result;
}

function rows(id, items, render, empty) {
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

function linkReceipt(row, value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://pay.stripe.com') return;
    const link = document.createElement('a');
    link.href = url;
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    link.textContent = '領収書を表示';
    row.append(link);
  } catch { /* Stripe has no receipt for this order yet. */ }
}

function label(tag, text, className) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

async function reconcile(button, order, feedback) {
  button.disabled = true;
  feedback.textContent = '決済状況を確認しています…';
  try {
    const result = await request('orders/' + encodeURIComponent(order.id) + '/reconcile', {});
    const message = ['pending', 'fulfillment_pending', 'refund_pending'].includes(result.status)
      ? '決済結果を確認中です。時間をおいて購入履歴をご確認ください。'
      : '決済状況を更新しました。';
    orderFeedback.set(order.id, message);
    feedback.textContent = message;
    await load();
    const updated = document.getElementById('order-feedback-' + order.id);
    if (updated !== feedback) updated?.focus({ preventScroll: true });
  } catch {
    feedback.textContent = '決済結果を取得できませんでした。再購入せず、時間をおいて購入履歴をご確認ください。';
  } finally { button.disabled = false; }
}

function showAccount(account) {
  for (const id of ['account-history', 'lots', 'logout']) element(id).hidden = !account;
  for (const id of ['login', 'login-note']) element(id).hidden = Boolean(account);
  const balance = element('balance');
  balance.textContent = account ? number.format(account.wallet.available_credits) : '—';
  if (!account) return;
  balance.append(label('small', 'クレジット', ''));
  const { wallet, orders } = account;
  const totals = new Map();
  for (const lot of wallet.lots) {
    const expires = lot.expires_at_ms ?? 0;
    totals.set(expires, (totals.get(expires) ?? 0) + lot.amount);
  }
  rows('lots', [...totals].sort((a, b) => (a[0] || Infinity) - (b[0] || Infinity)), (row, [expiry, amount]) => {
    row.textContent = (expiry ? date.format(expiry) + 'まで' : '無期限') + '　' + number.format(amount);
  }, '利用できるクレジットはありません。');
  rows('orders', orders, (row, order) => {
    const title = label('div', order.title, 'record-title');
    title.append(label('span', date.format(order.created_at * 1000), 'muted record-meta'));
    const value = label('div', yen.format(order.amount), 'record-value');
    value.append(label('span', orderStatus[order.status] ?? '確認中', 'muted'));
    row.append(title, value);
    const actions = label('div', '', 'record-actions');
    const feedback = label('p', orderFeedback.get(order.id) ?? '', 'muted record-feedback');
    feedback.id = 'order-feedback-' + order.id;
    feedback.tabIndex = -1;
    feedback.setAttribute('role', 'status');
    if (order.amount_refunded > 0) actions.append(label('span', '返金 ' + yen.format(order.amount_refunded), 'muted'));
    if (order.receipt_url) linkReceipt(actions, order.receipt_url);
    if (['pending', 'fulfillment_pending', 'refund_pending', 'review_required'].includes(order.status)) {
      const button = label('button', '決済状況を再確認', 'quiet');
      button.addEventListener('click', () => void reconcile(button, order, feedback));
      actions.append(button);
    }
    if (actions.childNodes.length) row.append(actions);
    row.append(feedback);
  }, '購入履歴はありません。');
  rows('history', wallet.history, (row, item) => {
    const title = label('div', activity[item.operation.kind] ?? '確認中', 'record-title');
    title.append(label('span', date.format(item.at_ms), 'muted record-meta'));
    if (item.operation.kind === 'grant' && item.operation.expires_at_ms) {
      const expires = item.operation.expires_at_ms;
      title.append(label('span', '期限 ' + date.format(expires) + (expires <= Date.now() ? '（失効）' : ''), 'muted record-meta'));
    }
    row.append(title, label('span', (item.operation.kind === 'grant' ? '+' : '−') + number.format(item.operation.amount), 'record-value'));
  }, 'クレジット履歴はありません。');
}

function recoverableOrder(packID) {
  const key = 'mane-checkout:' + packID;
  const stored = sessionStorage.getItem(key);
  if (stored) {
    const value = JSON.parse(stored);
    if (value.created + 60 * 60 * 1000 > Date.now()) return [key, value.id];
  }
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ id, created: Date.now() }));
  return [key, id];
}

async function buy(button, pack) {
  button.disabled = true;
  status.textContent = 'Stripeの決済画面を準備しています…';
  try {
    const [key, id] = recoverableOrder(pack.id);
    const result = await request('checkout', { pack_id: pack.id, request_id: id }).catch(error => {
      if (error.message === 'order_expired') sessionStorage.removeItem(key);
      throw error;
    });
    const url = new URL(result.checkout_url);
    if (url.origin !== 'https://checkout.stripe.com') throw new Error('invalid_checkout');
    location.assign(url.href);
  } catch {
    status.textContent = '決済画面を開けませんでした。購入履歴で状況を確認してから、時間をおいて再試行してください。';
    button.disabled = false;
  }
}

async function load() {
  element('refresh').disabled = true;
  try {
    const [{ packs, checkout_enabled: enabled }, account] = await Promise.all([
      request('packs'),
      request('account').catch(error => {
        if (error.message === 'login_required') return null;
        throw error;
      }),
    ]);
    showAccount(account);
    element('pack-note').hidden = false;
    element('pack-note').textContent = enabled ? 'Stripeテスト決済' : '販売準備中';
    rows('packs', packs, (row, pack) => {
      row.append(label('div', pack.title, 'pack-title'),
        label('div', number.format(pack.credits) + ' クレジット', 'pack-value'),
        label('div', yen.format(pack.amount) + ' · ' + validFor(pack.validity_seconds), 'muted'));
      if (!enabled || !account) return;
      const button = document.createElement('button');
      button.className = 'button primary';
      button.textContent = '決済へ進む';
      button.addEventListener('click', () => void buy(button, pack));
      row.append(button);
    }, '現在表示できるパックはありません。');
    status.textContent = loginFailed ? 'ログインを完了できませんでした。再試行してください。' :
      returned === 'canceled' ? '購入手続きから戻りました。決済状況は購入履歴で確認できます。' :
      returned === 'returned' ? '決済状況を購入履歴で確認できます。反映まで時間がかかる場合があります。' :
      account ? '' : '残高を表示するにはログインしてください。';
  } catch {
    status.textContent = '現在ショップに接続できません。時間をおいて再試行してください。';
    element('packs').replaceChildren();
  } finally {
    element('refresh').hidden = false;
    element('refresh').disabled = false;
  }
}

element('refresh').addEventListener('click', () => void load());
element('logout').addEventListener('click', async () => {
  const button = element('logout');
  button.disabled = true;
  try {
    await request('auth/logout', {});
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('mane-checkout:')) sessionStorage.removeItem(key);
    }
    orderFeedback.clear();
    showAccount(null);
    await load();
  } catch {
    status.textContent = 'ログアウトできませんでした。再試行してください。';
  } finally { button.disabled = false; }
});
if (returned === 'returned') {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith('mane-checkout:')) sessionStorage.removeItem(key);
  }
}
void load();
