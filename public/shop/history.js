import { readShop } from './shop-read.js';
import { date, element, forgetCompletedOrders, label, number, openCheckout, request, rows, yen } from './shop-common.js';

const orderStatus = {
  pending: '決済待ち', payment_failed: '決済失敗', paid: '付与済み', expired: '決済期限切れ',
  fulfillment_pending: '支払い確認済み・付与中', refunded: '返金済み', refund_pending: '返金反映中',
  review_required: '確認中',
};
const activity = { grant: '付与', spend: '消費', reverse: '返金に伴う引き戻し' };
const orderFeedback = new Map();
const resumeAvailability = new Map();

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

function showOrders(items, resumeSupported) {
  forgetCompletedOrders(items);
  rows('records', items, (row, order) => {
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
      if (order.status === 'pending' && resumeSupported && resumeAvailability.get(order.id) !== false) {
        const resume = label('button', '決済を再開', 'button order-action');
        resume.addEventListener('click', () => void reconcile(order, feedback, true));
        actions.append(resume);
      }
    }
    if (actions.childNodes.length) row.append(actions);
    row.append(feedback);
  }, '購入履歴はありません。');
}

function showActivity(items) {
  rows('records', items, (row, item) => {
    const title = label('div', activity[item.operation.kind] ?? '確認中', 'record-title');
    title.append(label('span', date.format(item.at_ms), 'muted record-meta'));
    if (item.operation.kind === 'grant' && item.operation.expires_at_ms) {
      const expires = item.operation.expires_at_ms;
      title.append(label('span', '期限 ' + date.format(expires) + (expires <= Date.now() ? '（失効）' : ''), 'muted record-meta'));
    }
    row.append(title, label('span', (item.operation.kind === 'grant' ? '+' : '−') + number.format(item.operation.amount), 'record-value'));
  }, 'クレジット履歴はありません。');
}

const params = new URLSearchParams(location.search);
const purchases = params.get('type') !== 'activity';
const returned = params.get('checkout');
const title = purchases ? '購入履歴' : 'クレジット利用履歴';
const heading = element('history-heading');
const status = element('status');
const refresh = element('refresh');
const pagination = element('pagination');
const previous = element('previous');
const next = element('next');
const cursors = [''];
let page = 0;
let nextCursor = '';
let loading = false;
let failedTarget;
let legacyHistory = false;

heading.textContent = title;
document.title = title + ' | マネーちゃん';
element(purchases ? 'orders-link' : 'activity-link').setAttribute('aria-current', 'page');
if (purchases && ['returned', 'canceled'].includes(returned)) {
  history.replaceState(null, '', location.pathname);
  const notice = element('checkout-return');
  notice.hidden = false;
  notice.textContent = returned === 'canceled'
    ? '決済画面から戻りました。下の注文から状況を確認できます。'
    : '決済結果が履歴に反映されるまで時間がかかることがあります。';
}

async function readPage(target) {
  const cursor = cursors[target];
  if (!legacyHistory && !cursor?.startsWith('recent:')) {
    const query = cursor ? '?' + new URLSearchParams({ cursor }) : '';
    try {
      return await readShop('history/' + (purchases ? 'orders' : 'activity') + query);
    } catch (error) {
      if (error.status === 404) legacyHistory = true;
      else if (error.status !== 503 || target !== 0) throw error;
    }
  }
  // Use the recent history when the paginated API is missing or unavailable.
  // Keep later pages on the chosen source so a transient error cannot skip records.
  const account = await request('account');
  const all = purchases ? account.orders : account.wallet.history;
  const start = target * 20;
  const end = start + 20;
  const packs = purchases && account.resume_supported ? await request('packs').catch(() => null) : null;
  return {
    items: all.slice(start, end),
    next_cursor: end < all.length ? 'recent:' + end : '',
    resume_supported: Boolean(packs?.checkout_enabled),
    legacy_limit: true,
  };
}

async function load(target = page) {
  if (loading) return;
  loading = true;
  const records = element('records');
  const login = element('login');
  refresh.disabled = previous.disabled = next.disabled = true;
  status.textContent = '履歴を読み込み中…';
  records.setAttribute('aria-busy', 'true');
  try {
    const result = await readPage(target);
    if (purchases) showOrders(result.items, result.resume_supported);
    else showActivity(result.items);
    records.hidden = false;
    login.hidden = true;
    nextCursor = result.next_cursor ?? '';
    const changed = target !== page;
    page = target;
    cursors.length = page + 1;
    if (nextCursor) cursors.push(nextCursor);
    pagination.hidden = page === 0 && !nextCursor;
    element('page-number').textContent = number.format(page + 1) + 'ページ目';
    status.textContent = result.legacy_limit ? '現在は最新50件まで表示しています。' : '';
    failedTarget = undefined;
    if (changed) heading.focus();
  } catch (error) {
    failedTarget = target;
    if (error.status === 401) {
      records.replaceChildren();
      records.hidden = pagination.hidden = true;
      element('checkout-return').hidden = true;
      login.hidden = false;
      status.textContent = '履歴を見るにはログインしてください。';
    } else {
      status.textContent = '履歴を読み込めませんでした。再読み込みしてください。';
    }
  } finally {
    records.removeAttribute('aria-busy');
    refresh.hidden = !login.hidden;
    refresh.textContent = failedTarget === undefined ? '更新' : '再試行';
    refresh.disabled = false;
    previous.disabled = page === 0;
    next.disabled = !nextCursor;
    loading = false;
  }
}

refresh.addEventListener('click', () => void load(failedTarget ?? page));
previous.addEventListener('click', () => void load(page - 1));
next.addEventListener('click', () => void load(page + 1));
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  element('records').hidden = pagination.hidden = true;
  void load();
});
void load();
