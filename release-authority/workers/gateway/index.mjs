export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (!url.search && url.origin === env.APPROVAL_ORIGIN) {
      const view = request.method === 'GET' && /^(?:\/approve\/[a-f0-9]{32}|\/approve\.(?:js|css))$/.test(url.pathname);
      const action = request.method === 'POST' && /^\/approve\/[a-f0-9]{32}\/(?:arm|confirm|reject)$/.test(url.pathname);
      if (view || action) return env.APPROVAL_INTAKE.fetch(request);
    }
    if (!url.search && url.origin === env.VERIFIER_ORIGIN && request.method === 'POST') {
      if (url.pathname === '/v1/releases') return env.VERIFIER_INTAKE.fetch(request);
      if (/^\/v1\/releases\/[a-f0-9]{32}\/(?:result|upload)$/.test(url.pathname) && env.FINALIZER_INTAKE) {
        return env.FINALIZER_INTAKE.fetch(request);
      }
    }
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  },
};
