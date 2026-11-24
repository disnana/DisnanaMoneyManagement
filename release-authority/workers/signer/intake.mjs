const maxManifestBytes = 8192;

function response(message, status) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': status === 200 ? 'application/json' : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function readManifestBody(request) {
  if (!request.body || request.headers.get('Content-Type') !== 'application/json') throw new Error('Expected a manifest');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let wire = '';
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return wire + decoder.decode();
      bytes += value.length;
      if (bytes > maxManifestBytes) {
        await reader.cancel();
        throw new Error('Manifest exceeds limit');
      }
      wire += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export function makeVerifierIntake({ origin, authenticate, ledger }) {
  if (new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new Error('Verifier requires an exact HTTPS origin');
  return async function handle(request) {
    if (request.url !== origin + '/v1/releases' || request.method !== 'POST') return response('Not found', 404);
    let principal;
    try {
      principal = await authenticate(request.headers);
      if (principal.role !== 'verifier') return response('Not found', 404);
    } catch {
      return response('Not found', 404);
    }
    try {
      const wire = await readManifestBody(request);
      const releaseHash = await ledger().register(wire, principal);
      return response(JSON.stringify({ releaseHash }), 200);
    } catch {
      return response('Release unavailable', 409);
    }
  };
}
