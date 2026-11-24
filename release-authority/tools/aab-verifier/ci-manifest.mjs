import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { manifestWire, randomId, readManifest, sha256Hex } from '../../packages/protocol/manifest.mjs';

const dir = resolve(process.env.RUNNER_TEMP, 'mane-authority');
const file = (name) => readFile(resolve(dir, name));
const json = async (name) => JSON.parse(await file(name));
const requireValue = (valid, message) => { if (!valid) throw new Error(message); };

const build = await json('build-evidence.json');
const quality = await json('quality.json');
const aab = await file('app-release.aab');
const audit = await file('audit.json');
const sbom = await file('sbom.cdx.json');
const digest = await sha256Hex(aab);
const invocation = `https://github.com/disnana/DisnanaMoneyManagement/actions/runs/${build.buildRunId}/attempts/${build.buildRunAttempt}`;
const aabProvenance = await json('app-release.aab.attestation.json');
const qualityProvenance = await json('quality.json.attestation.json');
for (const attestations of [aabProvenance, qualityProvenance]) {
  requireValue(attestations.some(({ verificationResult }) => {
    const certificate = verificationResult?.signature?.certificate;
    return certificate?.runInvocationURI === invocation
      && certificate.sourceRepositoryIdentifier === '1462301394'
      && certificate.sourceRepositoryOwnerIdentifier === '149747105'
      && certificate.buildSignerDigest === build.sourceCommitSha
      && verificationResult.statement?.predicate?.runDetails?.metadata?.invocationId === invocation;
  }),
  'Verified attestation does not identify the configured run and attempt');
}
requireValue(
  quality.schema === 'disnana.release-quality.v1' && quality.commitSha === build.sourceCommitSha
    && quality.unsignedAabSha256 === digest && quality.auditReportSha256 === await sha256Hex(audit)
    && quality.sbomSha256 === await sha256Hex(sbom) && quality.packageName === 'com.disnana.mane_chan'
    && typeof quality.versionName === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(quality.versionName)
    && Number.isSafeInteger(quality.versionCode) && quality.versionCode >= 1 && quality.versionCode <= 2_100_000_000,
  'Quality evidence does not match the target AAB',
);
const checks = JSON.parse(audit);
const components = JSON.parse(sbom);
requireValue(
  checks.bunRoot?.exitCode === 0 && checks.bunMobile?.exitCode === 0 && checks.bunAuthority?.exitCode === 0
    && checks.gradleDependencies?.exitCode === 0 && checks.gradleVerification?.mode === 'strict'
    && checks.tests?.exitCode === 0 && components.bomFormat === 'CycloneDX'
    && Array.isArray(components.components) && components.components.length > 0,
  'Required release checks are missing',
);

if (process.argv[2] === 'validate') {
  console.log(digest);
} else {
  const preparedInput = await file('proof/input.bin');
  const fields = {
    appId: 'moneychan', packageName: quality.packageName,
    versionName: quality.versionName, versionCode: quality.versionCode,
    repositoryId: process.env.GITHUB_REPOSITORY_ID, commitSha: build.sourceCommitSha,
    buildRunId: String(build.buildRunId), buildRunAttempt: build.buildRunAttempt, buildWorkflowSha: build.sourceCommitSha,
    artifactId: String(build.artifacts['Mane-chan-unsigned-app-bundle'].id), unsignedAabSha256: digest,
    manifestSha256: await sha256Hex(await file('proof/MANIFEST.MF')),
    signatureFileSha256: await sha256Hex(await file('proof/MANE.SF')),
    signingInputSha256: await sha256Hex(preparedInput), signingInputLength: preparedInput.length,
    buildProofSha256: await sha256Hex(await file('app-release.aab.attestation.json')),
    artifactProofSha256: await sha256Hex(await file('quality.json.attestation.json')),
    auditReportSha256: quality.auditReportSha256, sbomSha256: quality.sbomSha256,
    algorithm: 'SHA256withRSA', keyId: process.env.RELEASE_UPLOAD_KEY_ID,
    uploadCertificateSha256: process.env.RELEASE_UPLOAD_CERTIFICATE_SHA256,
    targetTrack: process.env.RELEASE_TARGET_TRACK, releaseStatus: process.env.RELEASE_STATUS || 'upload-only',
    policyVersion: Number(process.env.RELEASE_POLICY_VERSION),
  };
  if (process.argv[2] === 'create') {
    const issuedAt = new Date(process.env.RELEASE_ISSUED_AT);
    const wire = manifestWire({
      ...fields, schema: 'disnana.release-manifest.v1', releaseId: randomId(), nonce: randomId(),
      verifierRunId: process.env.GITHUB_RUN_ID,
      verifierWorkflowSha: process.env.RELEASE_AUTHORITY_WORKFLOW_SHA ?? process.env.GITHUB_WORKFLOW_SHA,
      issuedAt: issuedAt.toISOString(), expiresAt: new Date(issuedAt.getTime() + 15 * 60_000).toISOString(),
    });
    await writeFile(resolve(dir, 'manifest.json'), wire, { flag: 'wx' });
  } else if (process.argv[2] === 'compare') {
    const manifest = readManifest(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
    const authoritySha = process.env.RELEASE_AUTHORITY_WORKFLOW_SHA;
    if (authoritySha) {
      requireValue(manifest.verifierWorkflowSha === authoritySha, 'Authority revision differs from the approved verifier');
    }
    for (const [field, value] of Object.entries(fields)) {
      // Verification output can include transient metadata. attestation is checked again above.
      if (field === 'buildProofSha256' || field === 'artifactProofSha256') continue;
      requireValue(manifest[field] === value, `Immutable release field differs: ${field}`);
    }
  } else {
    throw new Error('Expected validate, create, or compare');
  }
}
