import { importPKCS8, SignJWT } from 'jose';

const api = 'https://api.github.com';
const repo = '/repos/disnana/DisnanaMoneyManagement';
const repositoryId = 1462301394;
const workflow = 'release-authority.yml';
const branch = 'main';
const numericId = /^[1-9][0-9]{0,19}$/;

export function makeDispatcher(env, request = fetch) {
  const appId = env.GITHUB_APP_ID;
  const installationId = env.GITHUB_APP_INSTALLATION_ID;
  if (!numericId.test(appId ?? '') || !numericId.test(installationId ?? '')) {
    throw new Error('Missing GitHub App configuration');
  }
  const call = (path, token, body) => request(api + path, {
    redirect: 'error', signal: AbortSignal.timeout(8000),
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`, 'User-Agent': 'disnana-release-authority',
      Accept: 'application/vnd.github+json', 'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let key;
  return async function dispatch({ buildRunId, verifierRunId, workflowSha }) {
    if (!numericId.test(buildRunId ?? '') || !numericId.test(verifierRunId ?? '')
      || !/^[a-f0-9]{40}$/.test(workflowSha ?? '') || buildRunId === verifierRunId) return 409;
    let sending = false;
    try {
      key ??= importPKCS8(env.GITHUB_APP_PKCS8_PEM, 'RS256');
      const now = Math.floor(Date.now() / 1000);
      const assertion = await new SignJWT({}).setProtectedHeader({ alg: 'RS256' })
        .setIssuer(appId).setIssuedAt(now - 60).setExpirationTime(now + 480).sign(await key);
      const installation = await call(`/app/installations/${installationId}/access_tokens`, assertion, {
        repository_ids: [repositoryId], permissions: { actions: 'write' },
      });
      if (installation.status !== 201) return 409;
      const { token } = await installation.json();
      if (typeof token !== 'string' || !/^[A-Za-z0-9._~+/-]+=*$/.test(token)) return 409;
      const verifier = await call(`${repo}/actions/runs/${verifierRunId}`, token);
      if (!verifier.ok) return 409;
      const run = await verifier.json();
      if (String(run.id) !== verifierRunId || run.conclusion !== 'success' || !['workflow_dispatch', 'workflow_run'].includes(run.event)
        || run.path !== `.github/workflows/${workflow}` || run.head_branch !== branch || run.head_sha !== workflowSha
        || run.repository?.id !== repositoryId || run.head_repository?.id !== repositoryId) return 409;
      sending = true;
      const result = await call(`${repo}/actions/workflows/${workflow}/dispatches`, token, {
        ref: branch, inputs: { operation: 'finalize', build_run_id: buildRunId, verifier_run_id: verifierRunId, upload_to_play: 'true' },
      });
      if (result.status === 204 || result.status === 200) return 204;
      return [400, 401, 403, 404, 422, 429].includes(result.status) ? 409 : 502;
    } catch {
      return sending ? 502 : 409;
    }
  };
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || request.url !== 'https://release-dispatch.internal/finalize'
      || request.headers.get('Content-Type') !== 'application/json') return new Response(null, { status: 404 });
    try {
      const status = await makeDispatcher(env)(await request.json());
      return new Response(null, { status });
    } catch {
      return new Response(null, { status: 409 });
    }
  },
};
