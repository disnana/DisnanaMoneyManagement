import { open } from 'node:fs/promises';
import { readManifest, sha256Hex } from '../../packages/protocol/manifest.mjs';

const stagingApi = 'https://release-api-stg.disnana.com/v1/releases';
const stagingApproval = 'https://release-stg.disnana.com/approve/';
export async function getStagingCiCredentials(env, role, request) {
  if (!['verifier', 'finalizer', 'publisher'].includes(role)) throw new Error('Unknown CI role');
  const secret = env[`RELEASE_${role.toUpperCase()}_SECRET`];
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret ?? '') || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    throw new Error('CI credentials are missing');
  }
  const tokenUrl = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if (tokenUrl.protocol !== 'https:' || tokenUrl.username || tokenUrl.password || tokenUrl.port
    || !tokenUrl.hostname.endsWith('.actions.githubusercontent.com')) {
    throw new Error('Unexpected GitHub OIDC token endpoint');
  }
  tokenUrl.searchParams.set('audience', `urn:disnana:release-authority:staging:${role}`);
  const tokenResponse = await request(tokenUrl, {
    headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenResponse.ok) throw new Error(`GitHub OIDC returned HTTP ${tokenResponse.status}`);
  const { value: token } = await tokenResponse.json();
  if (typeof token !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    throw new Error('GitHub did not return a JWT');
  }
  return { Authorization: `Bearer ${token}`, 'X-Release-Secret': secret };
}

export async function registerStagingManifest(wire, env, request = fetch) {
  const manifest = readManifest(wire);
  if (manifest.releaseStatus !== 'upload-only') throw new Error('Expected a bundle-only release');
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY_ID !== manifest.repositoryId
    || env.GITHUB_RUN_ID !== manifest.verifierRunId || (env.RELEASE_SOURCE_SHA ?? env.GITHUB_SHA) !== manifest.commitSha) {
    throw new Error('Manifest does not match this GitHub Actions run');
  }
  const credentials = await getStagingCiCredentials(env, 'verifier', request);
  const result = await request(stagingApi, {
    method: 'POST',
    headers: {
      ...credentials,
      'Content-Type': 'application/json',
    },
    body: wire,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!result.ok) {
    const ray = result.headers.get('cf-ray') ?? '';
    const reference = /^[a-f0-9]{12,32}-[A-Z]{3,5}$/.test(ray) ? ` (CF-Ray ${ray})` : '';
    throw new Error(`Staging registration returned HTTP ${result.status}${reference}`);
  }
  const { releaseHash } = await result.json();
  if (releaseHash !== await sha256Hex(wire)) throw new Error('Signer returned a different release manifest hash');
  return { releaseHash, approvalUrl: stagingApproval + manifest.releaseId };
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: register-staging.mjs MANIFEST');
    const file = await open(process.argv[2], 'r');
    let wire;
    try {
      const buffer = Buffer.alloc(8193);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > 8192) throw new Error('Manifest exceeds the size limit');
      wire = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
    } finally {
      await file.close();
    }
    console.log(JSON.stringify(await registerStagingManifest(wire, process.env)));
  } catch (error) {
    console.error(error instanceof TypeError ? 'Manifest input or network request failed' : error.message);
    process.exitCode = 1;
  }
}
