import { clearShopAssignment, readShop } from './shop-read.js';
import { date, element, forgetCompletedOrders, label, number, openCheckout, request, rows, yen } from './shop-common.js';

const status = element('status');
const params = new URLSearchParams(location.search);
const returned = params.get('checkout');
const loginFailed = params.get('login') === 'failed';
const historyURL = '/shop/history/';
if (returned === 'returned' || returned === 'canceled') {
  location.replace(historyURL + '?checkout=' + returned);
} else if (loginFailed) {
  history.replaceState(null, '', location.pathname);
}

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

function showAccountID(value) {
  const accountID = typeof value === 'string' && value.length <= 255 ? value : '';
  const input = element('account-id');
  const details = element('account-details');
  if (accountID !== input.value) {
    element('copy-status').textContent = '';
    details.open = false;
  }
  input.value = accountID;
  details.hidden = !accountID;
}

function showAccount(account) {
  for (const id of ['wallet-expiry', 'logout']) element(id).hidden = !account;
  for (const id of ['login', 'login-note']) element(id).hidden = Boolean(account);
  showAccountID(account?.account_id);
  const balance = element('balance');
  balance.textContent = account ? number.format(account.wallet.available_credits) : '—';
  if (!account) return;
  balance.append(label('small', 'クレジット', ''));
  const { wallet } = account;
  const totals = new Map();
  for (const lot of wallet.lots) {
    const expires = lot.expires_at_ms ?? 0;
    totals.set(expires, (totals.get(expires) ?? 0) + lot.amount);
  }
  rows('lots', [...totals].sort((a, b) => (a[0] || Infinity) - (b[0] || Infinity)), (row, [expiry, amount]) => {
    row.append(label('strong', number.format(amount) + ' cr', ''), label('span', expiry ? date.format(expiry) + 'まで' : '無期限', ''));
  }, '利用できるクレジットはありません。');
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

function cheapestPack(packs) {
  return packs.reduce((lowest, pack) => {
    if (!lowest || pack.amount < lowest.amount) return pack;
    const validity = item => item.validity_seconds ?? Infinity;
    return pack.amount === lowest.amount && validity(pack) > validity(lowest) ? pack : lowest;
  }, null);
}

function updateCheckoutButton() {
  const button = element('checkout-button');
  const selected = offeredPacks.find(pack => pack.id === selectedPackID);
  button.disabled = !checkoutEnabled || !selected || checkoutInProgress;
  button.textContent = selected ? yen.format(selected.amount) + 'の決済へ進む' : '決済へ進む';
  element('checkout-selection').textContent = selected ? selected.title + ' · ' + number.format(selected.credits) + ' cr' : '';
}

function resetCheckout() {
  checkoutInProgress = false;
  element('checkout-form').querySelector('fieldset').disabled = false;
  updateCheckoutButton();
}

function renderPacks(packs, testMode, enabled, account) {
  offeredPacks = packs;
  checkoutEnabled = Boolean(enabled && account && packs.length);
  const groups = new Map([['', []]]);
  for (const pack of packs) {
    const category = pack.category ?? '';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(pack);
  }
  const general = groups.get('');
  if (!packs.some(pack => pack.id === selectedPackID)) {
    const initial = cheapestPack(general.length ? general : packs);
    selectedPackID = initial?.id ?? '';
  }
  element('checkout-action').hidden = !checkoutEnabled;
  element('pack-note').textContent = checkoutEnabled ? (testMode ? 'テスト決済' : '') : '販売準備中';
  const renderPack = (row, pack, cheapest) => {
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
    const description = label('span', '', 'pack-description');
    const meta = label('span', '', 'pack-meta');
    meta.append(label('span', validFor(pack.validity_seconds), 'pack-duration'));
    description.append(label('span', pack.title, 'pack-title'), meta);
    const value = label('span', number.format(pack.credits), 'pack-value');
    value.append(label('small', 'cr', ''));
    option.append(description, value, label('span', yen.format(pack.amount), 'pack-price'));
    if (cheapest && pack.id !== cheapest.id) {
      const savings = Math.round((1 - (pack.amount / pack.credits) / (cheapest.amount / cheapest.credits)) * 1000) / 10;
      if (savings > 0) meta.append(label('span', '約' + number.format(savings) + '%お得', 'pack-saving'));
    }
    row.append(option);
  };
  const renderGroup = (id, entries) => {
    const baseline = new Map();
    for (const pack of entries) {
      const previous = baseline.get(pack.validity_seconds);
      if (!previous || pack.amount < previous.amount) baseline.set(pack.validity_seconds, pack);
    }
    rows(id, entries, (row, pack) => renderPack(row, pack, baseline.get(pack.validity_seconds)), '現在表示できるパックはありません。');
  };
  const generalList = element('packs');
  generalList.hidden = !general.length && groups.size > 1;
  renderGroup('packs', general);
  document.querySelectorAll('.pack-category').forEach(section => section.remove());
  const categories = [...groups].slice(1);
  let previousGroup = generalList;
  for (const [index, [name, entries]] of categories.entries()) {
    const section = label('section', '', 'pack-category');
    const heading = label('h3', name, 'pack-category-heading');
    heading.id = 'pack-category-' + index;
    section.setAttribute('aria-labelledby', heading.id);
    const list = label('ul', '', 'pack-list');
    list.id = 'pack-category-list-' + index;
    section.append(heading, list);
    previousGroup.after(section);
    previousGroup = section;
    renderGroup(list.id, entries);
  }
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
      if (['order_expired', 'order_conflict'].includes(error.message)) sessionStorage.removeItem(key);
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
  const note = element('pack-note');
  const loading = note.textContent ? undefined : setTimeout(() => { note.textContent = '読み込み中…'; }, 300);
  try {
    const account = await readShop('summary').catch(error => {
      if (error.status === 404 || error.status === 503) return request('account');
      throw error;
    }).catch(error => {
      if (error.status === 401) return null;
      throw error;
    });
    showAccount(account);
    if (account?.orders) forgetCompletedOrders(account.orders);
    status.textContent = loginFailed ? 'ログインを完了できませんでした。再試行してください。' : '';
    try {
      const { packs, checkout_enabled: enabled, test_mode: testMode } = account?.catalog ?? await request('packs');
      renderPacks(packs, testMode, enabled, account);
    } catch {
      renderPacks([], false, false, null);
      element('pack-note').textContent = 'パックを取得できませんでした。更新して再試行してください。';
    }
  } catch {
    status.textContent = '現在ショップに接続できません。時間をおいて再試行してください。';
    showAccount(null);
    renderPacks([], false, false, null);
    element('pack-note').textContent = '';
  } finally {
    clearTimeout(loading);
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
    clearShopAssignment();
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('mane-checkout:')) sessionStorage.removeItem(key);
    }
    showAccount(null);
    element('login').focus({ preventScroll: true });
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
if (returned !== 'returned' && returned !== 'canceled') void load();
