import { useSyncExternalStore } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { admissionHash, DeviceProofHTTPError, getAndroidDeviceProof, submitDeviceProof } from './androidProof';

type Settings = { entry: string; nodes: Record<string, string>; googleClientID: string; projectNumber: string };
type Session = { session_id: string; access_token: string; refresh_token: string; expires_at: number };
type State = { signedIn: boolean; credits: number | null; busy: boolean; message: string };
const settings = Constants.expoConfig?.extra?.maneAuth as Settings | undefined;
const device = Platform.OS === 'android' && settings ? getAndroidDeviceProof() : null;
let session: Session | null = null;
let loaded = false;
let state: State = { signedIn: false, credits: null, busy: false, message: '' };
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
  return session as Session;
}

async function setSession(next: Session | null) {
  await device!.saveSession(next ? JSON.stringify(next) : null);
  session = next;
  publish({ signedIn: Boolean(next), credits: null });
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
    const response = await submitDeviceProof(settings!.entry, settings!.nodes, op, credentials, device!, controller.signal);
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

async function authenticated(op: { method: 'GET'; path: '/v1/credits' } | { method: 'POST'; path: '/auth/logout' }) {
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
  publish({ credits: null });
  try {
    const response = await authenticated({ method: 'GET', path: '/v1/credits' });
    const result = await response.json() as { available_credits?: unknown };
    const amount = result.available_credits;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid balance');
    publish({ credits: amount });
  } catch {
    publish({ message: session ? '残高を取得できませんでした。再読み込みできます。' : 'セッションが切れました。もう一度ログインしてください。' });
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
  return run(loadCredits, 'アカウント情報を読み込めませんでした。');
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
    await loadCredits();
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
