// Loopback workerd fixture. Static approval and a generated test key are injected by Cap'n Proto.
const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const maximumBytes = 64 * 1024;
let key;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/aab-proof' || url.search || request.method !== 'POST') {
      return new Response(null, { status: 404 });
    }
    if (request.headers.get('Content-Type') !== 'application/octet-stream' || !request.body) {
      return new Response(null, { status: 415 });
    }
    const expected = new Uint8Array(env.APPROVED_INPUT);
    if (!expected.length || expected.length > maximumBytes) return new Response(null, { status: 503 });
    const reader = request.body.getReader();
    const input = new Uint8Array(expected.length);
    let offset = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.length > input.length - offset) {
          await reader.cancel();
          return new Response(null, { status: 413 });
        }
        input.set(value, offset);
        offset += value.length;
      }
    } finally {
      reader.releaseLock();
    }
    if (offset !== input.length || !crypto.subtle.timingSafeEqual(input, expected)) {
      return new Response(null, { status: 403 });
    }
    key ??= crypto.subtle.importKey('pkcs8', env.TEST_KEY, algorithm, false, ['sign']);
    const signature = await crypto.subtle.sign(algorithm.name, await key, input);
    return new Response(signature, { headers: { 'Content-Type': 'application/octet-stream' } });
  },
};
