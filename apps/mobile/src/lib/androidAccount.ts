import { useSyncExternalStore } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { fetch } from 'expo/fetch';
import { admissionHash, deviceProofHTTPError, deviceProofWindow, DeviceProofHTTPError, IssuerUnavailable, getAndroidDeviceProof, submitDeviceProof, type AuthenticatedOperation, type ReceiptOperation } from './androidProof';

type Settings = { entry: string; googleClientID: string; projectNumber: string };
type Session = { issuer_node_id: string; origin?: string; session_id: string; access_token: string; refresh_token: string; expires_at: number; account_id?: string };
export type CreditLot = { amount: number; expires_at_ms?: number };
type CreditActivity = { id: string; at_ms: number; operation: { kind: 'grant' | 'spend' | 'reverse' | 'expire'; amount: number; expired_lots?: CreditLot[] } };
type State = { signedIn: boolean; accountId: string | null; issuerNodeID: string | null; credits: number | null; history: CreditActivity[] | null; lots: CreditLot[] | null; expiredLots: CreditLot[] | null; busy: boolean; message: string };
const settings = Constants.expoConfig?.extra?.maneAuth as Settings | undefined;
const device = Platform.OS === 'android' && settings ? getAndroidDeviceProof() : null;
let session: Session | null = null;
let restored: Promise<void> | null = null;
const emptyCredits = { credits: null, history: null, lots: null, expiredLots: null };
let state: State = { signedIn: false, accountId: null, issuerNodeID: null, ...emptyCredits, busy: false, message: '' };
const listeners = new Set<() => void>();

export const accountAvailable = Boolean(device && settings);

function publish(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}

export function useAndroidAccount() {
  return useSyncExternalStore(subscribe, getAndroidAccountSnapshot, getAndroidAccountSnapshot);
}

export function getAndroidAccountSnapshot() {
  return state;
}

function nodeOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value ? value : undefined;
  } catch {
    return undefined;
  }
}

function verifiedAccountID(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 ? value : undefined;
}

function parseSession(value: unknown, local = false): Session {
  const session = value as Partial<Session> | null;
  if (!session || typeof session.session_id !== 'string' || !session.session_id ||
    typeof session.access_token !== 'string' || !session.access_token ||
    typeof session.refresh_token !== 'string' || !session.refresh_token ||
    typeof session.expires_at !== 'number' || !Number.isSafeInteger(session.expires_at)) {
    throw new Error('Invalid account session');
  }
  const issuer = session.issuer_node_id;
  if (typeof issuer !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(issuer)) throw new Error('Invalid session issuer');
  const origin = nodeOrigin(session.origin);
  return { issuer_node_id: issuer, origin: origin === settings?.entry ? undefined : origin, session_id: session.session_id, access_token: session.access_token,
    refresh_token: session.refresh_token, expires_at: session.expires_at, account_id: local ? verifiedAccountID(session.account_id) : undefined };
}

async function setSession(next: Session | null) {
  const sameSession = next !== null && next.session_id === session?.session_id;
  const saved = next && { ...next, account_id: next.account_id ?? (sameSession ? session?.account_id : undefined) };
  await device!.saveSession(saved ? JSON.stringify(saved) : null);
  session = saved;
  const accountId = saved?.account_id ?? null;
  const issuerNodeID = saved?.issuer_node_id ?? null;
  if (!sameSession) publish({ signedIn: Boolean(saved), accountId, issuerNodeID, ...emptyCredits });
  else if (state.issuerNodeID !== issuerNodeID || state.accountId !== accountId) publish({ accountId, issuerNodeID });
}

async function loadSavedSession() {
  try {
    const saved = await device!.loadSession();
    session = saved ? parseSession(JSON.parse(saved), true) : null;
    publish({ signedIn: Boolean(session), accountId: session?.account_id ?? null, issuerNodeID: session?.issuer_node_id ?? null });
  } catch {
    await setSession(null);
    publish({ message: '保存されていたログイン情報を読み込めませんでした。もう一度ログインしてください。' });
  }
}

function restore() {
  restored ??= loadSavedSession().catch(error => {
    restored = null;
    throw error;
  });
  return restored;
}

export async function restoreAndroidAccount() {
  if (accountAvailable) await restore();
}

async function assignedNode(current: Session, signal: AbortSignal) {
  const assignment = await fetch(settings!.entry + '/auth/node', {
    method: 'POST', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exclude: current.issuer_node_id, session_id: current.session_id, refresh_token: current.refresh_token }),
  });
  if (!assignment.ok) throw await deviceProofHTTPError(assignment);
  const node = await assignment.json() as { id?: string; origin?: string };
  const origin = nodeOrigin(node.origin);
  if (!origin || origin === current.origin || origin === settings!.entry || typeof node.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(node.id) || node.id === current.issuer_node_id || session !== current) {
    throw new IssuerUnavailable(false);
  }
  return { ...current, issuer_node_id: node.id, origin };
}

async function renewOnNode(current: Session, target: Session, signal: AbortSignal) {
  const { session_id, refresh_token } = current;
  const renewed = await submitDeviceProof(target.origin!, target.issuer_node_id, {
    path: '/auth/refresh', method: 'POST', body: JSON.stringify({ session_id, refresh_token }),
  }, { sessionId: session_id }, device!, signal, false);
  if (!renewed.ok) throw await deviceProofHTTPError(renewed);
  const assigned = parseSession(await renewed.json());
  if (assigned.session_id !== session_id || assigned.issuer_node_id !== target.issuer_node_id ||
      assigned.origin !== target.origin || session !== current) throw new IssuerUnavailable(false);
  await setSession(assigned);
  return assigned;
}

async function request(
  op: Parameters<typeof submitDeviceProof>[2],
  credentials: Parameters<typeof submitDeviceProof>[3],
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(cancel, Math.max(25_000, deviceProofWindow(op) + 15_000));
  try {
    let current = op.path === '/auth/google' ? null : session;
    let authorization = credentials;
    if (op.path.startsWith('/v1/ai/') && current && !current.origin) {
      const previous = current;
      try {
        current = await renewOnNode(previous, await assignedNode(previous, controller.signal), controller.signal);
        authorization = { ...credentials, accessToken: current.access_token };
      } catch (error) {
        throw new IssuerUnavailable(false, error);
      }
    }
    const send = (target: Session | null, authorization = credentials) => submitDeviceProof(target?.origin ?? settings!.entry,
      target?.issuer_node_id, op, authorization, device!, controller.signal, !target?.origin);
    let response;
    try {
      response = await send(current, authorization);
    } catch (error) {
      if (!current?.origin || !(error instanceof IssuerUnavailable) || error.mayHaveCommitted || controller.signal.aborted) throw error;
      let next: Session;
      try {
        next = await assignedNode(current, controller.signal);
      } catch {
        throw error;
      }
      if (op.path === '/auth/refresh') {
        response = await send(next);
      } else {
        let assigned: Session;
        try {
          assigned = await renewOnNode(current, next, controller.signal);
        } catch (error) {
          if (op.path.startsWith('/v1/ai/')) throw new IssuerUnavailable(false, error);
          throw error;
        }
        response = await send(assigned, { ...credentials, accessToken: assigned.access_token });
      }
    }
    if (!response.ok) throw await deviceProofHTTPError(response);
    return response;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', cancel);
  }
}

async function refresh() {
  if (!session) throw new Error('No account session');
  const { session_id, refresh_token } = session;
  const body = JSON.stringify({ session_id, refresh_token });
  try {
    const response = await request({ method: 'POST', path: '/auth/refresh', body }, { sessionId: session_id });
    const renewed = parseSession(await response.json());
    if (renewed.session_id !== session_id || session?.session_id !== session_id) throw new IssuerUnavailable(false);
    await setSession(renewed);
  } catch (error) {
    if (error instanceof DeviceProofHTTPError && error.status === 401) await setSession(null);
    throw error;
  }
}

let accountRequests: Promise<unknown> = Promise.resolve();
function forCurrentSession<T>(run: () => Promise<T>) {
  const sessionID = session?.session_id;
  const operation = accountRequests.then(() => {
    if (!sessionID || session?.session_id !== sessionID) throw new DeviceProofHTTPError(401, 'login_required');
    return run();
  });
  accountRequests = operation.catch(() => {});
  return operation;
}

function authenticated(op: AuthenticatedOperation, signal?: AbortSignal) {
  return forCurrentSession(() => runAuthenticated(op, signal));
}

async function runAuthenticated(op: AuthenticatedOperation, signal?: AbortSignal) {
  if (signal?.aborted) throw new IssuerUnavailable(false, signal.reason);
  if (!session) throw new DeviceProofHTTPError(401, 'login_required');
  const renewSession = async () => {
    try {
      await refresh();
    } catch (error) {
      if (op.path.startsWith('/v1/ai/') && error instanceof IssuerUnavailable && error.mayHaveCommitted) {
        // The refresh may have committed, but this receipt operation has not.
        throw new IssuerUnavailable(false, error);
      }
      throw error;
    }
  };
  if (session.expires_at * 1000 < Date.now() + 10_000) await renewSession();
  const send = () => request(op, { accessToken: session!.access_token }, signal);
  try {
    return await send();
  } catch (error) {
    if (!(error instanceof DeviceProofHTTPError) || error.status !== 401) throw error;
    await renewSession();
    return send();
  }
}

export async function requestAndroidReceipt(op: ReceiptOperation, signal?: AbortSignal, expectedAccountId?: string) {
  if (!accountAvailable) throw new DeviceProofHTTPError(503, 'receipt_unavailable');
  await restore();
  return forCurrentSession(() => {
    if (expectedAccountId !== undefined && session?.account_id !== expectedAccountId) {
      throw new DeviceProofHTTPError(401, 'account_changed');
    }
    return runAuthenticated(op, signal);
  });
}

function readCreditLots(value: unknown): CreditLot[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((lot): lot is CreditLot => lot && Number.isSafeInteger(lot.amount) && lot.amount >= 0 &&
    (lot.expires_at_ms === undefined || Number.isSafeInteger(lot.expires_at_ms) &&
      lot.expires_at_ms >= 0 && lot.expires_at_ms <= 8.64e15));
}

async function loadCredits() {
  if (!session) return;
  const sessionId = session.session_id;
  publish(emptyCredits);
  try {
    const response = await authenticated({ method: 'GET', path: '/v1/credits' });
    const result = await response.json() as { available_credits?: unknown; history?: unknown; lots?: unknown; expired_lots?: unknown };
    const amount = result.available_credits;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid balance');
    const history = Array.isArray(result.history) ? result.history.slice(0, 20).filter((item): item is CreditActivity =>
      item && typeof item.id === 'string' && Number.isSafeInteger(item.at_ms) && item.at_ms >= 0 && item.at_ms <= 8.64e15 &&
      ['grant', 'spend', 'reverse', 'expire'].includes(item.operation?.kind) &&
      Number.isSafeInteger(item.operation?.amount) && item.operation.amount >= 0).map(item => ({
      ...item, operation: { ...item.operation, expired_lots: readCreditLots(item.operation.expired_lots) ?? undefined },
    })) : null;
    if (session?.session_id === sessionId) {
      publish({ credits: amount, history, lots: readCreditLots(result.lots), expiredLots: readCreditLots(result.expired_lots) });
    }
  } catch {
    publish({ message: session ? '残高を取得できませんでした。再読み込みできます。' : 'セッションが切れました。もう一度ログインしてください。' });
  }
}

async function loadAccount() {
  await loadCredits();
  if (!session || state.accountId !== null) return;
  try {
    await forCurrentSession(async () => {
      if (state.accountId !== null) return;
      const response = await runAuthenticated({ method: 'GET', path: '/v1/me' });
      const result = await response.json() as { subject?: unknown } | null;
      const accountId = verifiedAccountID(result?.subject);
      if (session && accountId) await setSession({ ...session, account_id: accountId });
    });
  } catch {
    if (!session) publish({ message: 'セッションが切れました。もう一度ログインしてください。' });
  }
}

async function run(operation: () => Promise<void>, failure: string) {
  if (!accountAvailable || state.busy) return;
  publish({ busy: true, message: '' });
  try {
    await restore();
    await operation();
  } catch {
    publish({ message: failure });
  } finally {
    publish({ busy: false });
  }
}

export function refreshAndroidAccount() {
  return run(loadAccount, 'アカウント情報を読み込めませんでした。');
}

export function signInAndroidAccount() {
  return run(async () => {
    if (session) return;
    const { publicKey, fingerprint } = await device!.getPublicIdentity();
    const idToken = await device!.googleIdToken(settings!.googleClientID, fingerprint);
    if (!idToken) return;
    const integrityToken = await device!.integrityToken(settings!.projectNumber, admissionHash(idToken, fingerprint));
    const body = JSON.stringify({ id_token: idToken, integrity_token: integrityToken, device_public_key: publicKey });
    const response = await request({ method: 'POST', path: '/auth/google', body }, { publicKey });
    await setSession(parseSession(await response.json()));
    await loadAccount();
  }, 'ログインできませんでした。通信とGoogle Playでの配布状況を確認して再試行してください。');
}

export function signOutAndroidAccount() {
  return run(async () => {
    if (session) {
      await forCurrentSession(async () => {
        try {
          await runAuthenticated({ method: 'POST', path: '/auth/logout' });
        } catch (error) {
          if (session) throw error;
        }
        await setSession(null);
      });
    }
    try { await device!.clearGoogleState(); } catch { /* The DMM session is already revoked. */ }
  }, 'ログアウトを完了できませんでした。通信を確認して再試行してください。');
}
