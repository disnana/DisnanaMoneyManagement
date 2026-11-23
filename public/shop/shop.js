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

function showAccount(account) {
  for (const id of ['wallet', 'orders-section', 'history-section', 'logout']) element(id).hidden = !account;
  element('login').hidden = Boolean(account);
  if (!account) return;
  const { wallet, orders } = account;
  element('balance').textContent = number.format(wallet.available_credits) + ' クレジット';
  const totals = new Map();
  for (const lot of wallet.lots) {
    const expires = lot.expires_at_ms ?? 0;
    totals.set(expires, (totals.get(expires) ?? 0) + lot.amount);
  }
  rows('lots', [...totals].sort((a, b) => a[0] - b[0]), (row, [expiry, amount]) => {
    row.textContent = (expiry ? date.format(expiry) + 'まで' : '無期限') + '　' + number.format(amount);
  }, '利用できるクレジットはありません。');
  rows('orders', orders, (row, order) => {
    row.textContent = date.format(order.created_at * 1000) + '　' + order.title + '　' + yen.format(order.amount) + '　' + (orderStatus[order.status] ?? '確認中');
    if (order.amount_refunded > 0) row.append('　返金 ' + yen.format(order.amount_refunded));
    if (order.receipt_url) linkReceipt(row, order.receipt_url);
  }, '購入履歴はありません。');
  rows('history', wallet.history, (row, item) => {
    row.textContent = date.format(item.at_ms) + '　' + (activity[item.operation.kind] ?? '確認中') + '　' + number.format(item.operation.amount);
    if (item.operation.kind === 'grant' && item.operation.expires_at_ms) {
      const expires = item.operation.expires_at_ms;
      row.append('　期限 ' + date.format(expires) + (expires <= Date.now() ? '（失効）' : ''));
    }
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
      if (['order_conflict', 'order_expired'].includes(error.message)) sessionStorage.removeItem(key);
      throw error;
    });
    const url = new URL(result.checkout_url);
    if (url.origin !== 'https://checkout.stripe.com') throw new Error('invalid_checkout');
    location.assign(url.href);
  } catch {
    status.textContent = '決済画面を開けませんでした。しばらく待って再試行してください。';
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
    element('pack-note').textContent = enabled ? 'テスト購入用です。' : 'クレジットの販売は準備中です。';
    rows('packs', packs, (row, pack) => {
      row.textContent = pack.title + '　' + number.format(pack.credits) + ' クレジット　' + yen.format(pack.amount);
      row.append(pack.validity_seconds === null ? '　無期限' : '　決済から ' + number.format(pack.validity_seconds / 3600) + ' 時間有効');
      if (!enabled || !account) return;
      row.append(document.createElement('br'));
      const button = document.createElement('button');
      button.className = 'button primary';
      button.textContent = 'Stripeの決済画面へ';
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
