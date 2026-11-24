import { readFile } from 'node:fs/promises';
import { createPublicKey } from 'node:crypto';
import { importSPKI } from 'jose';
import { readManifest, sha256Hex } from '../../packages/protocol/manifest.mjs';
import { verifyUploadReceipt } from '../../packages/protocol/receipt.mjs';
import { getStagingCiCredentials } from '../aab-verifier/register-staging.mjs';

const [phase, manifestPath, signaturePath, signedAabSha256, result] = process.argv.slice(2);
try {
  const start = phase === 'start' && result === undefined;
  const finish = phase === 'finish' && ['stored', 'already_present'].includes(result);
  if ((!start && !finish) || !/^[a-f0-9]{64}$/.test(signedAabSha256 ?? '')) {
    throw new Error('Expected start or finish and the verified AAB digest');
  }
  const wire = await readFile(manifestPath, 'utf8');
  const manifest = readManifest(wire);
  if (process.env.GITHUB_ACTIONS !== 'true' || manifest.releaseStatus !== 'upload-only'
    || process.env.GITHUB_REPOSITORY_ID !== manifest.repositoryId
    || (process.env.RELEASE_SOURCE_SHA ?? process.env.GITHUB_SHA) !== manifest.commitSha) {
    throw new Error('Manifest does not match this publisher');
  }
  const signature = await readFile(signaturePath);
  if (![256, 384, 512].includes(signature.length)) throw new Error('Unexpected signature size');
  const keyId = process.env.RELEASE_RECEIPT_KEY_ID;
  if (!/^[a-zA-Z0-9._-]{1,96}$/.test(keyId ?? '') || keyId === manifest.keyId) throw new Error('Expected a receipt key ID');
  const publicPem = process.env.RELEASE_RECEIPT_PUBLIC_SPKI_PEM;
  const publicKey = await importSPKI(publicPem, 'ES256');
  const spki = createPublicKey(publicPem).export({ type: 'spki', format: 'der' });
  const report = {
    phase, releaseHash: await sha256Hex(wire), signatureHash: await sha256Hex(signature),
    signedAabSha256, versionCode: manifest.versionCode, receiptKeyId: keyId, receiptPublicKeySha256: await sha256Hex(spki),
    ...(finish ? { result } : {}),
  };
  const headers = await getStagingCiCredentials(process.env, 'publisher', fetch);
  const response = await fetch(`https://release-api-stg.disnana.com/v1/releases/${manifest.releaseId}/upload`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify(report),
  });
  if (!response.ok) throw new Error(`Release audit returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.status !== (start ? 'reserved' : 'recorded')) throw new Error('Unexpected upload audit result');
  if (finish) {
    await verifyUploadReceipt(body.receipt, {
      keyId, publicKey, manifest, report, runId: process.env.GITHUB_RUN_ID, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    });
    console.log(body.receipt);
  }
} catch (error) {
  console.error(error instanceof TypeError ? 'Could not read evidence or reach the signer' : error.message);
  process.exitCode = 1;
}
