const maxSigningBytes = 64 * 1024;

function respond(body, status, type = 'text/plain; charset=utf-8') {
  return new Response(body, { status, headers: {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}

async function readSigningInput(request) {
  if (!request.body || request.headers.get('Content-Type') !== 'application/octet-stream') {
    throw new Error('Expected CMS signing input');
  }
  const buffer = new Uint8Array(maxSigningBytes);
  const reader = request.body.getReader();
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return buffer.slice(0, length);
      if (length + value.length > buffer.length) {
        await reader.cancel();
        throw new Error('Signing input exceeds limit');
      }
      buffer.set(value, length);
      length += value.length;
    }
  } finally {
    reader.releaseLock();
  }
}

export function makeFinalizeIntake({ origin, authenticate, ledger }) {
  if (new URL(origin).origin !== origin || !origin.startsWith('https://')) {
    throw new Error('Finalizer requires an exact HTTPS origin');
  }
  return async function handle(request) {
    const url = new URL(request.url);
    const route = /^\/v1\/releases\/([a-f0-9]{32})\/result$/.exec(url.pathname);
    const hash = request.headers.get('X-Release-Hash');
    if (request.method !== 'POST' || url.origin !== origin || url.search || !route
      || !/^[a-f0-9]{64}$/.test(hash ?? '')) return respond('Not found', 404);
    let principal;
    try {
      principal = await authenticate(request.headers);
      if (principal.role !== 'finalizer') return respond('Not found', 404);
    } catch {
      return respond('Not found', 404);
    }
    try {
      const result = await ledger().signApproved(route[1], hash, await readSigningInput(request), principal);
      if (result.status === 'signed' || result.status === 'cached') {
        return respond(JSON.stringify(result), 200, 'application/json');
      }
    } catch {
      // Avoid leaking the release state or the details of the signing key.
    }
    return respond('Release unavailable', 409);
  };
}
