// Local-only edge simulator. It accepts test URLs over loopback HTTP.
export default {
  fetch(request, env) {
    const mode = new URL(request.url).pathname;
    const target = request.headers.get('x-fixture-target');
    return (mode === '/private-default' ? env.SIGNER_DEFAULT : env.GATEWAY).fetch(new Request(target, request));
  },
};

export const FixtureJwks = {
  fetch(request, env) {
    const url = new URL(request.url);
    if (![
      'https://token.actions.githubusercontent.com/.well-known/jwks',
      'https://fixture-team.cloudflareaccess.com/cdn-cgi/access/certs',
    ].includes(url.href)) return new Response(null, { status: 404 });
    return Response.json(JSON.parse(env.JWKS));
  },
};

export const FixtureDispatcher = {
  async fetch(request) {
    const data = await request.json();
    const matched = request.url === 'https://release-dispatch.internal/finalize' && request.method === 'POST'
      && data.buildRunId === '99' && data.verifierRunId === '103' && data.workflowSha === 'd'.repeat(40);
    return new Response(null, { status: matched ? 204 : 409 });
  },
};
