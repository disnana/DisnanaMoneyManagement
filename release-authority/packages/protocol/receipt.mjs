import { CompactSign, compactVerify } from 'jose';
import { manifestWire, sha256Hex } from './manifest.mjs';

const receiptType = 'disnana-release-receipt+jws';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const isHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isId = (value) => typeof value === 'string' && /^[a-zA-Z0-9._-]{1,96}$/.test(value);

function requireReceipt(condition) {
  if (!condition) throw new Error('Release receipt policy mismatch');
}

// Only a trusted publisher may present an authenticated Play response to this local component.
export async function issueDraftReceipt({
  manifest, releaseHash, approvalId, approvedAt, signatureSha256, signedAabSha256,
  publisherRunId, playResponse, issuedAt, issuer, keyId, receiptKey,
}) {
  requireReceipt(await sha256Hex(manifestWire(manifest)) === releaseHash);
  requireReceipt(isId(issuer) && isId(keyId) && keyId !== manifest.keyId && isId(approvalId)
    && isId(publisherRunId) && isHash(signatureSha256) && isHash(signedAabSha256)
    && typeof approvedAt === 'string' && Number.isFinite(Date.parse(approvedAt))
    && typeof issuedAt === 'string' && Date.parse(issuedAt) >= Date.parse(approvedAt));
  requireReceipt(playResponse.packageName === manifest.packageName
    && playResponse.targetTrack === manifest.targetTrack && playResponse.status === 'draft'
    && playResponse.versionCode === manifest.versionCode && playResponse.sha256 === signedAabSha256);

  const receipt = {
    schema: 'disnana.release-receipt.v1', issuer, issuedAt,
    releaseId: manifest.releaseId, releaseHash, approvalId, approvedAt,
    commitSha: manifest.commitSha, buildRunId: manifest.buildRunId, verifierRunId: manifest.verifierRunId,
    publisherRunId, unsignedAabSha256: manifest.unsignedAabSha256, signedAabSha256, signatureSha256,
    signingInputSha256: manifest.signingInputSha256, artifactProofSha256: manifest.artifactProofSha256,
    uploadCertificateSha256: manifest.uploadCertificateSha256,
    packageName: manifest.packageName, versionCode: manifest.versionCode,
    targetTrack: manifest.targetTrack, status: 'draft',
  };
  return new CompactSign(encoder.encode(JSON.stringify(receipt)))
    .setProtectedHeader({ alg: 'ES256', typ: receiptType, kid: keyId })
    .sign(receiptKey);
}

export async function verifyDraftReceipt(jws, { issuer, keyId, publicKey, releaseHash }) {
  requireReceipt(typeof jws === 'string' && jws.length <= 8192);
  const verified = await compactVerify(jws, publicKey, { algorithms: ['ES256'] });
  const receipt = JSON.parse(decoder.decode(verified.payload));
  requireReceipt(verified.protectedHeader.typ === receiptType && verified.protectedHeader.kid === keyId
    && receipt.schema === 'disnana.release-receipt.v1' && receipt.issuer === issuer
    && receipt.releaseHash === releaseHash && receipt.status === 'draft');
  return Object.freeze(receipt);
}

export async function issueUploadReceipt(record, { issuer, keyId, receiptKey }) {
  const { manifest, hash, signatureHash, signedAabSha256, approvedAt, uploadedAt, uploadResult } = record;
  requireReceipt(record.state === 'UPLOADED' && manifest.releaseStatus === 'upload-only'
    && ['stored', 'already_present'].includes(uploadResult)
    && await sha256Hex(manifestWire(manifest)) === hash
    && isHash(signatureHash) && isHash(signedAabSha256) && isId(record.finalizerRunId)
    && Number.isSafeInteger(approvedAt) && Number.isSafeInteger(uploadedAt) && uploadedAt >= approvedAt
    && isId(issuer) && isId(keyId) && keyId !== manifest.keyId);
  const receipt = {
    schema: 'disnana.release-receipt.v1', issuer, issuedAt: new Date(uploadedAt).toISOString(),
    approvedAt: new Date(approvedAt).toISOString(), releaseId: manifest.releaseId, releaseHash: hash,
    commitSha: manifest.commitSha, buildRunId: manifest.buildRunId, verifierRunId: manifest.verifierRunId,
    publisherRunId: record.finalizerRunId, publisherRunAttempt: record.finalizerRunAttempt,
    unsignedAabSha256: manifest.unsignedAabSha256, signedAabSha256, signatureSha256: signatureHash,
    signingInputSha256: manifest.signingInputSha256, artifactProofSha256: manifest.artifactProofSha256,
    uploadCertificateSha256: manifest.uploadCertificateSha256, packageName: manifest.packageName,
    versionCode: manifest.versionCode, status: uploadResult,
  };
  return new CompactSign(encoder.encode(JSON.stringify(receipt)))
    .setProtectedHeader({ alg: 'ES256', typ: receiptType, kid: keyId })
    .sign(receiptKey);
}

export async function verifyUploadReceipt(jws, { keyId, publicKey, manifest, report, runId, runAttempt }) {
  requireReceipt(typeof jws === 'string' && jws.length <= 8192);
  const confirmed = await compactVerify(jws, publicKey, { algorithms: ['ES256'] });
  requireReceipt(confirmed.protectedHeader.typ === receiptType && confirmed.protectedHeader.kid === keyId);
  const body = JSON.parse(decoder.decode(confirmed.payload));
  requireReceipt(body.schema === 'disnana.release-receipt.v1' && body.issuer === 'disnana-release-authority'
    && body.releaseId === manifest.releaseId && body.releaseHash === report.releaseHash
    && body.commitSha === manifest.commitSha && body.buildRunId === manifest.buildRunId && body.verifierRunId === manifest.verifierRunId
    && body.publisherRunId === runId && body.publisherRunAttempt === runAttempt
    && body.unsignedAabSha256 === manifest.unsignedAabSha256 && body.signedAabSha256 === report.signedAabSha256
    && body.signatureSha256 === report.signatureHash && body.signingInputSha256 === manifest.signingInputSha256
    && body.artifactProofSha256 === manifest.artifactProofSha256
    && body.uploadCertificateSha256 === manifest.uploadCertificateSha256
    && body.packageName === manifest.packageName && body.versionCode === manifest.versionCode
    && body.status === report.result);
  return Object.freeze(body);
}
