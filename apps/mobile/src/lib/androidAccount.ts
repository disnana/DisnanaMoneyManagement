import { useSyncExternalStore } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { admissionHash, DeviceProofHTTPError, getAndroidDeviceProof, submitDeviceProof } from './androidProof';

type Settings = { entry: string; googleClientID: string; projectNumber: string };
type Session = { issuer_node_id: string; session_id: string; access_token: string; refresh_token: string; expires_at: number };
type CreditActivity = { id: string; at_ms: number; operation: { kind: 'grant' | 'spend' | 'reverse'; amount: number } };
type State = { signedIn: boolean; accountId: string | null; credits: number | null; history: CreditActivity[] | null; busy: boolean; message: string };
const settings = Constants.expoConfig?.extra?.maneAuth as Settings | undefined;
const device = Platform.OS === 'android' && settings ? getAndroidDeviceProof() : null;
let session: Session | null = null;
let loaded = false;
let state: State = { signedIn: false, accountId: null, credits: null, history: null, busy: false, message: '' };
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
  return useSyncExternalStore(subscribe, () => state, () => state);
}

function parseSession(value: unknown): Session {
  const session = value as Partial<Session> | null;
  if (!session || typeof session.session_id !== 'string' || !session.session_id ||
    typeof session.access_token !== 'string' || !session.access_token ||
    typeof session.refresh_token !== 'string' || !session.refresh_token ||
    typeof session.expires_at !== 'number' || !Number.isSafeInteger(session.expires_at)) {
    throw new Error('Invalid account session');
  }
  const issuer = session.issuer_node_id;
  if (typeof issuer !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(issuer)) throw new Error('Invalid session issuer');
  return { issuer_node_id: issuer, session_id: session.session_id, access_token: session.access_token,
    refresh_token: session.refresh_token, expires_at: session.expires_at };
}

async function setSession(next: Session | null) {
  const sameSession = next !== null && next.issuer_node_id === session?.issuer_node_id && next.session_id === session?.session_id;
  await device!.saveSession(next ? JSON.stringify(next) : null);
  session = next;
  if (!sameSession) publish({ signedIn: Boolean(next), accountId: null, credits: null, history: null });
}

async function restore() {
  if (loaded) return;
  try {
    const saved = await device!.loadSession();
    session = saved ? parseSession(JSON.parse(saved)) : null;
    publish({ signedIn: Boolean(session) });
  } catch {
    await setSession(null);
    publish({ message: '保存されていたログイン情報を読み込めませんでした。もう一度ログインしてください。' });
  }
  loaded = true;
}

async function request(op: Parameters<typeof submitDeviceProof>[2], credentials: Parameters<typeof submitDeviceProof>[3]) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20_000);
  try {
    const issuer = op.path === '/auth/google' ? undefined : session!.issuer_node_id;
    const response = await submitDeviceProof(settings!.entry, issuer, op, credentials, device!, controller.signal);
    if (!response.ok) throw new DeviceProofHTTPError(response.status);
    return response;
  } finally {
    clearTimeout(deadline);
  }
}

async function refresh() {
  if (!session) throw new Error('No account session');
  const { session_id, refresh_token } = session;
  const body = JSON.stringify({ session_id, refresh_token });
  try {
    const response = await request({ method: 'POST', path: '/auth/refresh', body }, { sessionId: session_id });
    await setSession(parseSession(await response.json()));
  } catch (error) {
    if (error instanceof DeviceProofHTTPError && error.status === 401) await setSession(null);
    throw error;
  }
}

async function authenticated(op: { method: 'GET'; path: '/v1/me' | '/v1/credits' } | { method: 'POST'; path: '/auth/logout' }) {
  if (!session) throw new Error('No account session');
  if (session.expires_at * 1000 < Date.now() + 10_000) await refresh();
  const send = () => request(op, { accessToken: session!.access_token });
  try {
    return await send();
  } catch (error) {
    if (!(error instanceof DeviceProofHTTPError) || error.status !== 401) throw error;
    await refresh();
    return send();
  }
}

async function loadCredits() {
  if (!session) return;
  publish({ credits: null, history: null });
  try {
    const response = await authenticated({ method: 'GET', path: '/v1/credits' });
    const result = await response.json() as { available_credits?: unknown; history?: unknown };
    const amount = result.available_credits;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid balance');
    const history = Array.isArray(result.history) ? result.history.slice(0, 20).filter((item): item is CreditActivity =>
      item && typeof item.id === 'string' && Number.isSafeInteger(item.at_ms) && item.at_ms >= 0 && item.at_ms <= 8.64e15 &&
      ['grant', 'spend', 'reverse'].includes(item.operation?.kind) &&
      Number.isSafeInteger(item.operation?.amount) && item.operation.amount >= 0) : null;
    publish({ credits: amount, history });
  } catch {
    publish({ message: session ? '残高を取得できませんでした。再読み込みできます。' : 'セッションが切れました。もう一度ログインしてください。' });
  }
}

async function loadAccount() {
  await loadCredits();
  if (!session || state.accountId !== null) return;
  try {
    const response = await authenticated({ method: 'GET', path: '/v1/me' });
    const result = await response.json() as { subject?: unknown } | null;
    if (typeof result?.subject === 'string' && result.subject.length > 0 && result.subject.length <= 255) {
      publish({ accountId: result.subject });
    }
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
      try {
        await authenticated({ method: 'POST', path: '/auth/logout' });
      } catch (error) {
        if (session) throw error;
      }
      await setSession(null);
    }
    try { await device!.clearGoogleState(); } catch { /* The DMM session is already revoked. */ }
  }, 'ログアウトを完了できませんでした。通信を確認して再試行してください。');
}
