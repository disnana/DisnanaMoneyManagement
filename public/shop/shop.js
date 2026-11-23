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
const resumeAvailability = new Map();
const completedOrderStatuses = new Set(['paid', 'refunded', 'payment_failed', 'expired']);
let offeredPacks = [];
let selectedPackID = '';
let checkoutEnabled = false;
let checkoutInProgress = false;

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

function openCheckout(value) {
  const url = new URL(value);
  if (url.origin !== 'https://checkout.stripe.com' || url.username || url.password) {
    throw new Error('invalid_checkout');
  }
  location.assign(url.href);
}

async function reconcile(order, feedback, resume) {
  const buttons = feedback.parentElement.querySelectorAll('.order-action');
  buttons.forEach(button => { button.disabled = true; });
  feedback.textContent = resume ? '元の決済画面を確認しています…' : '決済状況を確認しています…';
  try {
    const result = await request('orders/' + encodeURIComponent(order.id) + (resume ? '/resume' : '/reconcile'), {});
    if (resume && result.checkout_url) {
      openCheckout(result.checkout_url);
      return;
    }
    if (typeof result.resume_available === 'boolean') resumeAvailability.set(order.id, result.resume_available);
    const message = result.resume_available ? 'まだお支払いは完了していません。「決済を再開」から続けられます。' :
      result.status === 'pending' ? '決済状況を確認しました。この注文の決済画面は再開できません。' :
      ['fulfillment_pending', 'refund_pending'].includes(result.status) ? '反映中です。時間をおいて購入履歴をご確認ください。' :
      '決済状況を更新しました。';
    orderFeedback.set(order.id, message);
    feedback.textContent = message;
    await load();
    const updated = document.getElementById('order-feedback-' + order.id);
    if (updated !== feedback) updated?.focus({ preventScroll: true });
  } catch {
    feedback.textContent = '決済結果を取得できませんでした。再購入せず、時間をおいて購入履歴をご確認ください。';
  } finally { buttons.forEach(button => { button.disabled = false; }); }
}

function showAccountID(value) {
  const accountID = typeof value === 'string' && value.length <= 255 ? value : '';
  const input = element('account-id');
  if (accountID !== input.value) element('copy-status').textContent = '';
  input.value = accountID;
  element('account-details').hidden = !accountID;
}

function forgetCompletedOrders(orders) {
  const completed = new Set(orders.filter(order => completedOrderStatuses.has(order.status)).map(order => order.id));
  if (!completed.size) return;
  for (const key of Object.keys(sessionStorage)) {
    if (!key.startsWith('mane-checkout:')) continue;
    try {
      if (completed.has(JSON.parse(sessionStorage.getItem(key))?.id)) sessionStorage.removeItem(key);
    } catch { /* A malformed checkout reference is ignored. */ }
  }
}

function showAccount(account, purchasesEnabled = false) {
  for (const id of ['account-history', 'lots', 'logout']) element(id).hidden = !account;
  for (const id of ['login', 'login-note']) element(id).hidden = Boolean(account);
  showAccountID(account?.account_id);
  const balance = element('balance');
  balance.textContent = account ? number.format(account.wallet.available_credits) : '—';
  if (!account) return;
  balance.append(label('small', 'クレジット', ''));
  const { wallet, orders } = account;
  forgetCompletedOrders(orders);
  const totals = new Map();
  for (const lot of wallet.lots) {
    const expires = lot.expires_at_ms ?? 0;
    totals.set(expires, (totals.get(expires) ?? 0) + lot.amount);
  }
  rows('lots', [...totals].sort((a, b) => (a[0] || Infinity) - (b[0] || Infinity)), (row, [expiry, amount]) => {
    row.append(label('strong', number.format(amount) + ' cr', ''), label('span', expiry ? date.format(expiry) + 'まで' : '無期限', ''));
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
      const button = label('button', '決済状況を再確認', 'quiet order-action');
      button.addEventListener('click', () => void reconcile(order, feedback, false));
      actions.append(button);
      if (order.status === 'pending' && purchasesEnabled && account.resume_supported && resumeAvailability.get(order.id) !== false) {
        const resume = label('button', '決済を再開', 'button order-action');
        resume.addEventListener('click', () => void reconcile(order, feedback, true));
        actions.append(resume);
      }
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
  try {
    const value = JSON.parse(sessionStorage.getItem(key));
    if (typeof value?.id === 'string' && value.created + 60 * 60 * 1000 > Date.now()) return [key, value.id];
  } catch { /* Create a fresh ID when the stored reference is malformed. */ }
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ id, created: Date.now() }));
  return [key, id];
}

function expiryTestPack(pack, testMode) {
  return testMode && Number.isFinite(pack.validity_seconds) && pack.validity_seconds > 0 && pack.validity_seconds <= 3600;
}

function updateCheckoutButton() {
  const button = element('checkout-button');
  const selected = offeredPacks.find(pack => pack.id === selectedPackID);
  button.disabled = !checkoutEnabled || !selected || checkoutInProgress;
  button.textContent = selected ? yen.format(selected.amount) + 'の決済へ進む' : '決済へ進む';
}

function resetCheckout() {
  checkoutInProgress = false;
  element('checkout-form').querySelector('fieldset').disabled = false;
  updateCheckoutButton();
}

function renderPacks(packs, testMode, enabled, account) {
  offeredPacks = packs;
  checkoutEnabled = Boolean(enabled && account && packs.length);
  const regular = packs.filter(pack => !expiryTestPack(pack, testMode));
  const cheapest = regular.reduce((lowest, pack) => !lowest || pack.amount < lowest.amount ? pack : lowest, null);
  if (!packs.some(pack => pack.id === selectedPackID)) selectedPackID = (cheapest ?? packs[0])?.id ?? '';
  element('checkout-action').hidden = !checkoutEnabled;
  element('pack-note').textContent = checkoutEnabled ? (testMode ? 'Stripeテスト決済' : '') : '販売準備中';
  rows('packs', packs, (row, pack) => {
    const option = label(checkoutEnabled ? 'label' : 'div', '', 'pack-option');
    if (checkoutEnabled) {
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'pack';
      input.value = pack.id;
      input.checked = pack.id === selectedPackID;
      input.addEventListener('change', () => {
        if (!input.checked) return;
        selectedPackID = pack.id;
        element('checkout-status').textContent = '';
        updateCheckoutButton();
      });
      option.append(input);
    }
    const top = label('span', '', 'pack-top');
    top.append(label('span', pack.title, 'pack-title'), label('span', yen.format(pack.amount), 'pack-price'));
    const value = label('span', number.format(pack.credits), 'pack-value');
    value.append(label('small', 'cr', ''));
    option.append(top, value, label('span', validFor(pack.validity_seconds), 'pack-duration'));
    if (expiryTestPack(pack, testMode)) {
      option.append(label('span', '失効確認用', 'pack-saving'));
    } else if (cheapest && pack.id !== cheapest.id) {
      const savings = Math.round((1 - (pack.amount / pack.credits) / (cheapest.amount / cheapest.credits)) * 1000) / 10;
      if (savings > 0) option.append(label('span', '約' + number.format(savings) + '%お得', 'pack-saving'));
    }
    row.append(option);
  }, '現在表示できるパックはありません。');
  updateCheckoutButton();
}

async function buy(pack) {
  if (!checkoutEnabled || checkoutInProgress) return;
  checkoutInProgress = true;
  const controls = element('checkout-form').querySelector('fieldset');
  const feedback = element('checkout-status');
  controls.disabled = true;
  updateCheckoutButton();
  feedback.textContent = 'Stripeの決済画面を準備しています…';
  try {
    const [key, id] = recoverableOrder(pack.id);
    const result = await request('checkout', { pack_id: pack.id, request_id: id }).catch(error => {
      if (error.message === 'order_expired') sessionStorage.removeItem(key);
      throw error;
    });
    openCheckout(result.checkout_url);
  } catch {
    feedback.textContent = '決済画面を開けませんでした。購入履歴で状況を確認してから、時間をおいて再試行してください。';
    resetCheckout();
  }
}

async function load() {
  element('refresh').disabled = true;
  try {
    const [{ packs, checkout_enabled: enabled, test_mode: testMode }, account] = await Promise.all([
      request('packs'),
      request('account').catch(error => {
        if (error.message === 'login_required') return null;
        throw error;
      }),
    ]);
    showAccount(account, enabled);
    renderPacks(packs, testMode, enabled, account);
    status.textContent = loginFailed ? 'ログインを完了できませんでした。再試行してください。' :
      returned === 'canceled' ? (account?.resume_supported && enabled
        ? '購入履歴から決済状況を確認し、未払いの決済を再開できます。'
        : '購入手続きから戻りました。決済状況は購入履歴で確認できます。') :
      returned === 'returned' ? '決済状況を購入履歴で確認できます。反映まで時間がかかる場合があります。' :
      account ? '' : '残高を表示するにはログインしてください。';
  } catch {
    status.textContent = '現在ショップに接続できません。時間をおいて再試行してください。';
    renderPacks([], false, false, null);
    element('pack-note').textContent = '';
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
    resumeAvailability.clear();
    showAccount(null);
    await load();
  } catch {
    status.textContent = 'ログアウトできませんでした。再試行してください。';
  } finally { button.disabled = false; }
});
element('checkout-form').addEventListener('submit', event => {
  event.preventDefault();
  const selected = offeredPacks.find(pack => pack.id === selectedPackID);
  if (selected) void buy(selected);
});
element('copy-account-id').addEventListener('click', async () => {
  const input = element('account-id');
  const status = element('copy-status');
  const accountID = input.value;
  if (!accountID) return;
  try {
    await navigator.clipboard.writeText(accountID);
    if (input.value === accountID) status.textContent = 'コピーしました。';
  } catch {
    if (input.value !== accountID) return;
    input.focus();
    input.select();
    status.textContent = '選択したIDをコピーしてください。';
  }
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  resetCheckout();
  element('checkout-status').textContent = '';
  void load();
});
void load();
