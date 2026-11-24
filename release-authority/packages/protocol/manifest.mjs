const sha256 = /^[0-9a-f]{64}$/;
const commit = /^[0-9a-f]{40}$/;
const id = /^[1-9][0-9]{0,19}$/;
const random = /^[0-9a-f]{32}$/;
const name = /^[A-Za-z0-9._-]{1,80}$/;
const utc = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const match = (pattern) => (value) => typeof value === 'string' && pattern.test(value);
const integer = (min, max) => (value) => Number.isSafeInteger(value) && value >= min && value <= max;
const equals = (expected) => (value) => value === expected;
const time = (value) => match(utc)(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

const fields = {
  schema: equals('disnana.release-manifest.v1'),
  releaseId: match(random), nonce: match(random),
  appId: match(name), packageName: match(name), versionName: match(name),
  versionCode: integer(1, 2_100_000_000),
  repositoryId: match(id), commitSha: match(commit),
  buildRunId: match(id), buildRunAttempt: integer(1, 1000), buildWorkflowSha: match(commit),
  verifierRunId: match(id), verifierWorkflowSha: match(commit), artifactId: match(id),
  unsignedAabSha256: match(sha256), manifestSha256: match(sha256), signatureFileSha256: match(sha256),
  signingInputSha256: match(sha256), signingInputLength: integer(1, 64 * 1024),
  buildProofSha256: match(sha256), artifactProofSha256: match(sha256),
  auditReportSha256: match(sha256), sbomSha256: match(sha256),
  algorithm: equals('SHA256withRSA'), keyId: match(name), uploadCertificateSha256: match(sha256),
  targetTrack: match(name), releaseStatus: equals('draft'), policyVersion: integer(1, 1_000_000),
  issuedAt: time, expiresAt: time,
};
const keys = Object.keys(fields).sort();
const encoder = new TextEncoder();

// This schema is a strict, flat ASCII and safe-integer subset of RFC 8785 JCS.
export function manifestWire(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length) {
    throw new TypeError('Invalid release manifest');
  }
  const ordered = {};
  for (const key of keys) {
    if (!Object.hasOwn(value, key) || !fields[key](value[key])) throw new TypeError(`Invalid manifest field: ${key}`);
    ordered[key] = value[key];
  }
  return JSON.stringify(ordered);
}

export function readManifest(wire) {
  if (typeof wire !== 'string' || wire.length > 8192) throw new TypeError('Manifest size outside policy');
  const value = JSON.parse(wire);
  // Byte equality also rejects duplicate keys, whitespace, alternate escapes and numeric spellings.
  if (manifestWire(value) !== wire) throw new TypeError('Manifest must be canonical');
  return Object.freeze(value);
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
