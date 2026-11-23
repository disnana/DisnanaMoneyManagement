import { requireOptionalNativeModule } from 'expo';
import { fetch } from 'expo/fetch';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

type DeviceProof = {
  getPublicIdentity(): Promise<{ publicKey: string; fingerprint: string }>;
  signChallenge(challenge: string): Promise<string>;
};

type Operation = { method: 'GET'; path: '/v1/me' } | { method: 'POST'; path: '/auth/google' | '/auth/refresh' | '/auth/logout'; body?: string };
type Credentials = { accessToken?: string; sessionId?: string; publicKey?: string };
type Challenge = { challenge: string; request_id: string; issuer_node_id: string; origin: string; expires_in_ms: number };
const proofWindowMs = 5000;

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
  nodes: Readonly<Record<string, string>>,
  op: Operation,
  credentials: Credentials,
  device: DeviceProof,
  signal?: AbortSignal,
): ReturnType<typeof fetch> {
  try {
    return await send(entry, nodes, op, credentials, device, signal);
  } catch (error) {
    if (!(error instanceof IssuerUnavailable) || op.method !== 'GET' || signal?.aborted) throw error;
    return send(entry, nodes, op, credentials, device, signal);
  }
}

class IssuerUnavailable extends Error {}

async function send(
  entry: string,
  nodes: Readonly<Record<string, string>>,
  op: Operation,
  credentials: Credentials,
  device: DeviceProof,
  signal?: AbortSignal,
): ReturnType<typeof fetch> {
  const body = op.method === 'POST' ? op.body : undefined;
  const entryOrigin = new URL(entry);
  if (entryOrigin.protocol !== 'https:' || entry !== entryOrigin.origin) throw new Error('Invalid auth entry');
  const authorization: Record<string, string> = credentials.accessToken ? { Authorization: `Bearer ${credentials.accessToken}` } : {};
  const response = await fetch(`${entry}/auth/challenge`, {
    method: 'POST',
    redirect: 'error',
    signal,
    headers: { 'Content-Type': 'application/json', ...authorization },
    body: JSON.stringify({
      operation: { method: op.method, path: op.path, body_sha256: sha(body ?? '') },
      session_id: credentials.sessionId,
      device_public_key: credentials.publicKey,
    }),
  });
  if (!response.ok) throw new Error(`Challenge request failed (${response.status})`);
  const receivedAt = performance.now();
  const proof = await response.json() as Challenge;
  const expected = Object.hasOwn(nodes, proof.issuer_node_id) ? nodes[proof.issuer_node_id] : undefined;
  if (!expected || proof.origin !== expected || new URL(expected).origin !== expected ||
    new URL(expected).protocol !== 'https:' || proof.expires_in_ms !== proofWindowMs ||
    typeof proof.challenge !== 'string' || typeof proof.request_id !== 'string') {
    throw new Error('Unexpected challenge response');
  }
  const signature = await device.signChallenge(proof.challenge);
  const timeLeft = proofWindowMs - (performance.now() - receivedAt);
  if (timeLeft <= 0) throw new IssuerUnavailable('Challenge expired');
  if (!/^\/(auth\/(google|refresh|logout)|v1\/me)$/.test(op.path)) throw new Error('Unsupported operation');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(cancel, timeLeft);
  try {
    const result = await fetch(`${expected}${op.path}`, {
      method: op.method,
      body,
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authorization,
        'X-Mane-Challenge': proof.challenge,
        'X-Mane-Request-Id': proof.request_id,
        'X-Mane-Device-Signature': signature,
      },
    });
    if (result.status >= 500) throw new Error('Issuer unavailable');
    return result;
  } catch (error) {
    if (!signal?.aborted) {
      // The receipt time gives a conservative bound on expiry without comparing device and server clocks.
      const remaining = Math.max(0, proofWindowMs - (performance.now() - receivedAt));
      await new Promise<void>(resolve => setTimeout(resolve, remaining));
    }
    if (signal?.aborted) throw error;
    throw new IssuerUnavailable('Issuer unavailable', { cause: error });
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', cancel);
  }
}
