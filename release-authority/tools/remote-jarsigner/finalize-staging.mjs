import { readFile, writeFile } from 'node:fs/promises';
import { readManifest, sha256Hex } from '../../packages/protocol/manifest.mjs';
import { getStagingCiCredentials } from '../aab-verifier/register-staging.mjs';

export async function requestStagingSignature(wire, input, env, request = fetch) {
  const manifest = readManifest(wire);
  if (manifest.releaseStatus !== 'upload-only' || env.GITHUB_ACTIONS !== 'true'
    || env.GITHUB_REPOSITORY_ID !== manifest.repositoryId || (env.RELEASE_SOURCE_SHA ?? env.GITHUB_SHA) !== manifest.commitSha
    || !/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID ?? '') || env.GITHUB_RUN_ID === manifest.verifierRunId) {
    throw new Error('Manifest does not match this independent GitHub Actions finalizer');
  }
  if (input.byteLength !== manifest.signingInputLength || await sha256Hex(input) !== manifest.signingInputSha256) {
    throw new Error('Recreated CMS input differs from the approved manifest');
  }
  const credentials = await getStagingCiCredentials(env, 'finalizer', request);
  const result = await request(`https://release-api-stg.disnana.com/v1/releases/${manifest.releaseId}/result`, {
    method: 'POST',
    headers: {
      ...credentials,
      'Content-Type': 'application/octet-stream',
      'X-Release-Hash': await sha256Hex(wire),
    },
    body: input,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!result.ok) throw new Error(`Staging signer returned HTTP ${result.status}`);
  const { status, signature, signatureHash } = await result.json();
  if (!['signed', 'cached'].includes(status) || !/^[A-Za-z0-9+/=]{344,684}$/.test(signature ?? '')) {
    throw new Error('Invalid signing result');
  }
  const bytes = Buffer.from(signature, 'base64');
  if (![256, 384, 512].includes(bytes.length) || bytes.toString('base64') !== signature
    || await sha256Hex(bytes) !== signatureHash) throw new Error('Signature bytes do not match the result');
  return bytes;
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 5) throw new Error('Usage: finalize-staging.mjs MANIFEST CMS_INPUT RAW_SIGNATURE');
    const [, , manifestPath, inputPath, outputPath] = process.argv;
    const wire = await readFile(manifestPath, 'utf8');
    const input = await readFile(inputPath);
    const bytes = await requestStagingSignature(wire, input, process.env);
    await writeFile(outputPath, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    console.error(error instanceof TypeError ? 'Signature input or network request failed' : error.message);
    process.exitCode = 1;
  }
}
