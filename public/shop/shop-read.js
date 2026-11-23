import { request } from './shop-common.js';

const key = 'mane-shop-read-assignment';

export function clearShopAssignment() {
  try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
}

function validAssignment(value) {
  if (!value || typeof value.id !== 'string' || typeof value.token !== 'string' ||
      !Number.isSafeInteger(value.expires_at) || value.expires_at * 1000 <= Date.now() + 5000) return false;
  try {
    const origin = new URL(value.origin);
    return origin.protocol === 'https:' && origin.origin === value.origin && origin.origin !== location.origin;
  } catch { return false; }
}

function savedAssignment() {
  try {
    const value = JSON.parse(sessionStorage.getItem(key));
    return validAssignment(value) ? value : null;
  } catch { return null; }
}

function remember(result) {
  if (validAssignment(result?.direct)) {
    try { sessionStorage.setItem(key, JSON.stringify(result.direct)); } catch { /* Storage may be disabled. */ }
  }
  return result;
}

async function readNode(node, path) {
  const response = await fetch(node.origin + '/v1/shop-read/' + path, {
    credentials: 'omit', redirect: 'error', cache: 'no-store',
    headers: { Authorization: 'Bearer ' + node.token }, signal: AbortSignal.timeout(3500),
  });
  if (!response.ok) throw Object.assign(new Error('shop_node_unavailable'), { status: response.status });
  const data = await response.json();
  return path === 'summary' ? { ...data, catalog: node.catalog } :
    { ...data, resume_supported: path.startsWith('history/orders') && Boolean(node.catalog?.checkout_enabled) };
}

async function assign(path) {
  try {
    const result = await request(path);
    if (!validAssignment(result?.direct)) throw new Error('shop_node_unavailable');
    remember(result);
    return result.direct;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function readShop(path) {
  if (!document.body.hasAttribute('data-shop-direct')) return request(path);
  const node = savedAssignment() ?? await assign('node');
  if (!node) return request(path);
  try {
    return await readNode(node, path);
  } catch (error) {
    if (error.status === 401) {
      clearShopAssignment();
      const next = await assign('node');
      return next ? readNode(next, path) : request(path);
    }
    if (error.status && error.status !== 404 && error.status < 500) throw error;
    clearShopAssignment();
    const next = await assign('node?' + new URLSearchParams({ exclude: node.id }));
    if (!next) return request(path);
    if (next.id === node.id || next.origin === node.origin) {
      clearShopAssignment();
      throw new Error('shop_node_unavailable');
    }
    return readNode(next, path);
  }
}
