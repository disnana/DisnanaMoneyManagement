import { requireOptionalNativeModule } from 'expo';
import { fetch } from 'expo/fetch';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export type DeviceProof = {
  getPublicIdentity(): Promise<{ publicKey: string; fingerprint: string }>;
  signChallenge(challenge: string): Promise<string>;
  googleIdToken(clientId: string, fingerprint: string): Promise<string | null>;
  integrityToken(projectNumber: string, requestHash: string): Promise<string>;
  loadSession(): Promise<string | null>;
  saveSession(value: string | null): Promise<void>;
  clearGoogleState(): Promise<void>;
};

export type ReceiptJobPath = `/v1/ai/receipt-jobs/${string}`;
export type ReceiptOperation = { method: 'GET'; path: '/v1/ai/receipt-config' | ReceiptJobPath } |
  { method: 'POST'; path: ReceiptJobPath; body: string };
export type AuthenticatedOperation = ReceiptOperation | { method: 'GET'; path: '/v1/me' | '/v1/credits' } |
  { method: 'POST'; path: '/auth/logout' };
type Operation = AuthenticatedOperation | { method: 'POST'; path: '/auth/google' | '/auth/refresh'; body: string };
type Credentials = { accessToken?: string; sessionId?: string; publicKey?: string };
type Challenge = { challenge: string; request_id: string; issuer_node_id: string; expires_in_ms: number };
const proofWindowMs = 5000;
const receiptProofWindowMs = 60000;
const receiptJob = /^\/v1\/ai\/receipt-jobs\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function deviceProofWindow(op: Operation) {
  if (receiptJob.test(op.path)) return op.method === 'POST' ? receiptProofWindowMs : proofWindowMs;
  if (op.method === 'GET' && ['/v1/me', '/v1/credits', '/v1/ai/receipt-config'].includes(op.path)) return proofWindowMs;
  if (op.method === 'POST' && ['/auth/google', '/auth/refresh', '/auth/logout'].includes(op.path)) return proofWindowMs;
  throw new Error('Unsupported operation');
}

function sha(input: string) {
  return bytesToHex(sha256(utf8ToBytes(input)));
}

export function getAndroidDeviceProof() {
  return requireOptionalNativeModule<DeviceProof>('DeviceProof');
}

export function admissionHash(idToken: string, publicKeyDigest: string) {
  return sha(`mane-login-integrity-v1\n${sha(idToken)}\n${publicKeyDigest}`);
}

export async function submitDeviceProof(
  entry: string,
  issuer: string | undefined,
  op: Operation,
  credentials: Credentials,
  device: DeviceProof,
  signal?: AbortSignal,
  retry = true,
): ReturnType<typeof fetch> {
  try {
    return await send(entry, issuer, op, credentials, device, signal);
  } catch (error) {
    if (!retry || !(error instanceof IssuerUnavailable) || op.method !== 'GET' || signal?.aborted) throw error;
    return send(entry, issuer, op, credentials, device, signal);
  }
}

export class IssuerUnavailable extends Error {
  constructor(readonly mayHaveCommitted: boolean, cause?: unknown) {
    super('Issuer unavailable', { cause });
  }
}

export class DeviceProofHTTPError extends Error {
  constructor(readonly status: number, readonly code?: string) {
    super(`Device proof request failed (${status})`);
  }
}

export async function deviceProofHTTPError(response: Awaited<ReturnType<typeof fetch>>) {
  let code: string | undefined;
  if (response.headers.get('Content-Type')?.includes('application/json')) {
    try {
      const value: unknown = (await response.json())?.error;
      if (typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value)) code = value;
    } catch { /* Fall back to the status when the error body cannot be read. */ }
  }
  return new DeviceProofHTTPError(response.status, code);
}

async function send(
  entry: string,
  issuer: string | undefined,
  op: Operation,
  credentials: Credentials,
  device: DeviceProof,
  signal?: AbortSignal,
): ReturnType<typeof fetch> {
  const windowMs = deviceProofWindow(op);
  if (signal?.aborted) throw new IssuerUnavailable(false, signal.reason);
  const body = 'body' in op ? op.body : undefined;
  const entryOrigin = new URL(entry);
  if (entryOrigin.protocol !== 'https:' || entry !== entryOrigin.origin) throw new Error('Invalid auth entry');
  const authorization: Record<string, string> = credentials.accessToken ? { Authorization: `Bearer ${credentials.accessToken}` } : {};
  const handshake = new AbortController();
  const stopHandshake = () => handshake.abort();
  if (signal?.aborted) stopHandshake();
  signal?.addEventListener('abort', stopHandshake, { once: true });
  const handshakeDeadline = setTimeout(stopHandshake, 4000);
  const response = await fetch(`${entry}/auth/challenge`, {
    method: 'POST',
    redirect: 'error',
    signal: handshake.signal,
    headers: { 'Content-Type': 'application/json', ...authorization, ...(issuer ? { 'X-Mane-Issuer': issuer } : {}) },
    body: JSON.stringify({
      operation: { method: op.method, path: op.path, body_sha256: sha(body ?? '') },
      session_id: credentials.sessionId,
      device_public_key: credentials.publicKey,
    }),
  }).catch(error => { throw new IssuerUnavailable(false, error); }).finally(() => {
    clearTimeout(handshakeDeadline);
    signal?.removeEventListener('abort', stopHandshake);
  });
  if (response.status >= 500) throw new IssuerUnavailable(false, await deviceProofHTTPError(response));
  if (!response.ok) throw await deviceProofHTTPError(response);
  const receivedAt = performance.now();
  const proof = await response.json() as Challenge;
  if (typeof proof.issuer_node_id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(proof.issuer_node_id) ||
    (issuer !== undefined && proof.issuer_node_id !== issuer) || proof.expires_in_ms !== windowMs ||
    typeof proof.challenge !== 'string' || typeof proof.request_id !== 'string') {
    throw new Error('Unexpected challenge response');
  }
  const signature = await device.signChallenge(proof.challenge);
  const timeLeft = windowMs - (performance.now() - receivedAt);
  if (timeLeft <= 0 || signal?.aborted) throw new IssuerUnavailable(false, signal?.reason);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(cancel, timeLeft);
  try {
    const result = await fetch(`${entry}${op.path}`, {
      method: op.method,
      body,
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authorization,
        'X-Mane-Issuer': proof.issuer_node_id,
        'X-Mane-Challenge': proof.challenge,
        'X-Mane-Request-Id': proof.request_id,
        'X-Mane-Device-Signature': signature,
      },
    });
    if (result.status >= 500) throw await deviceProofHTTPError(result);
    return result;
  } catch (error) {
    if (!signal?.aborted && op.method === 'POST' && windowMs === proofWindowMs) {
      // The receipt time gives a conservative bound on expiry without comparing device and server clocks.
      const remaining = Math.max(0, windowMs - (performance.now() - receivedAt));
      await new Promise<void>(resolve => setTimeout(resolve, remaining));
    }
    if (signal?.aborted && op.method === 'GET') throw error;
    throw new IssuerUnavailable(op.method === 'POST', error);
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', cancel);
  }
}
