import { date, element, forgetCompletedOrders, label, number, openCheckout, request, rows, yen } from './shop-common.js';

// Cached HTML can still reference this entry point.
if (element("wallet-expiry")) {
  void import("./shop-store-v3.js");
} else {
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
    if (accountID !== input.value) element('copy-status').textContent = '';
    input.value = accountID;
    element('account-details').hidden = !accountID;
  }

  function showAccount(account) {
    for (const id of ['lots', 'logout']) element(id).hidden = !account;
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
    try {
      const [{ packs, checkout_enabled: enabled, test_mode: testMode }, account] = await Promise.all([
        request('packs'),
        request('summary').catch(error => {
          if (error.status === 404 || error.status === 503) return request('account');
          throw error;
        }).catch(error => {
          if (error.status === 401) return null;
          throw error;
        }),
      ]);
      showAccount(account);
      if (account?.orders) forgetCompletedOrders(account.orders);
      renderPacks(packs, testMode, enabled, account);
      status.textContent = loginFailed ? 'ログインを完了できませんでした。再試行してください。' :
        account ? '' : '残高を表示するにはログインしてください。';
    } catch {
      status.textContent = '現在ショップに接続できません。時間をおいて再試行してください。';
      showAccount(null);
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
}
