const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export const digest = value => crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value);
export const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
export const hash = async value => hex(await digest(value));

export async function hmac(key, message) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, message);
}
export function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export const encode = value => encoder.encode(value);
export const decode = value => decoder.decode(value);

export async function readBytes(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('missing request body');
  const result = new Uint8Array(limit);
  let offset = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return result.subarray(0, offset);
      if (offset + chunk.value.length > limit) throw new Error('request body exceeds limit');
      result.set(chunk.value, offset);
      offset += chunk.value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export const json = (value, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export function callBackend(env, operation, data) {
  return env.shopRPC(operation, data);
}
