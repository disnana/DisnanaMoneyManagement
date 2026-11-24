import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';

const githubIssuer = 'https://token.actions.githubusercontent.com';
const secretPattern = /^(?:[A-Za-z0-9_-]{43}|[a-f0-9]{64})$/;
const digestPattern = /^[a-f0-9]{64}$/;
const shaPattern = /^[a-f0-9]{40}$/;
const idPattern = /^[1-9][0-9]{0,19}$/;
const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const encoder = new TextEncoder();
const jwksOptions = { cacheMaxAge: 5 * 60_000, cooldownDuration: 30_000, timeoutDuration: 2500 };

function deny() {
  throw new Error('Request identity rejected');
}

async function validateJwt(token, resolver, options) {
  if (!token || token.length > 8192 || !jwtPattern.test(token)) deny();
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'RS256' || !/^[A-Za-z0-9_.-]{1,128}$/.test(header.kid ?? '')
      || ['jku', 'x5u', 'jwk', 'x5c', 'crit'].some((field) => Object.hasOwn(header, field))) deny();
    const { payload } = await jwtVerify(token, resolver, { algorithms: ['RS256'], clockTolerance: 5, ...options });
    return payload;
  } catch {
    deny();
  }
}

function githubClaimsContainIds(claims) {
  return [claims.run_id, claims.run_attempt].every((value) => typeof value === 'string' && idPattern.test(value))
    && typeof claims.sha === 'string' && shaPattern.test(claims.sha)
    && typeof claims.jti === 'string' && claims.jti.length > 0 && claims.jti.length <= 256;
}

/** Configure this separately for each fixed Verifier or Finalizer workflow. */
export function makeCiAuthenticator(policy, {
  resolveKey = createRemoteJWKSet(new URL(`${githubIssuer}/.well-known/jwks`), jwksOptions),
  equal = (left, right) => crypto.subtle.timingSafeEqual(left, right),
} = {}) {
  const reusable = policy.reusableRef !== undefined || policy.reusableSha !== undefined;
  const fixedWorkflow = reusable ? policy.reusableRef && shaPattern.test(policy.reusableSha) : shaPattern.test(policy.callerSha);
  if (!digestPattern.test(policy.secretSha256) || ![policy.repositoryId, policy.ownerId].every((id) => idPattern.test(id))
    || !fixedWorkflow || !policy.audience || !policy.ref || !policy.callerRef
    || !policy.subject || (policy.callerSha && !shaPattern.test(policy.callerSha)) || !['verifier', 'finalizer', 'publisher'].includes(policy.role)) {
    throw new Error('Incomplete CI identity policy');
  }
  const expected = Uint8Array.from(policy.secretSha256.match(/../g), (pair) => parseInt(pair, 16));
  return async function authenticate(headers) {
    const secret = headers.get('x-release-secret');
    const authorization = headers.get('authorization');
    if (!secret || !secretPattern.test(secret) || !authorization?.startsWith('Bearer ')) deny();
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
    if (!equal(new Uint8Array(digest), expected)) deny();
    const claims = await validateJwt(authorization.slice(7), resolveKey, {
      issuer: githubIssuer, audience: policy.audience, maxTokenAge: '5m',
      requiredClaims: ['sub', 'iat', 'nbf', 'exp', 'jti'],
    });
    const expectedJobRef = reusable ? policy.reusableRef : policy.callerRef;
    const expectedJobSha = reusable ? policy.reusableSha : policy.callerSha;
    const hasJobIdentity = claims.job_workflow_ref !== undefined || claims.job_workflow_sha !== undefined;
    if (!githubClaimsContainIds(claims) || claims.aud !== policy.audience || claims.sub !== policy.subject
      || claims.repository_id !== policy.repositoryId || claims.repository_owner_id !== policy.ownerId
      || claims.ref !== policy.ref || claims.workflow_ref !== policy.callerRef || !shaPattern.test(claims.workflow_sha ?? '')
      || (policy.callerSha && claims.workflow_sha !== policy.callerSha)
      || ((reusable || hasJobIdentity)
        && (claims.job_workflow_sha !== expectedJobSha || claims.job_workflow_ref !== expectedJobRef))
      || (claims.event_name !== 'workflow_dispatch' && !(policy.role === 'verifier' && claims.event_name === 'workflow_run'))
      || claims.runner_environment !== 'github-hosted'
      || (policy.environment && claims.environment !== policy.environment)
      || claims.exp <= claims.iat || claims.exp - claims.iat > 305) deny();
    return Object.freeze({
      role: policy.role, repositoryId: claims.repository_id, commitSha: claims.sha,
      runId: claims.run_id, runAttempt: Number(claims.run_attempt), workflowSha: expectedJobSha,
    });
  };
}

export function makeAccessAuthenticator({ team, audience, administrators }, {
  resolveKey,
} = {}) {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(team) || !audience || !Array.isArray(administrators) || !administrators.length) {
    throw new Error('Incomplete Access identity policy');
  }
  const issuer = `https://${team}.cloudflareaccess.com`;
  const keys = resolveKey ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), jwksOptions);
  const allowed = new Set(administrators);
  return async function authenticate(headers) {
    const claims = await validateJwt(headers.get('cf-access-jwt-assertion'), keys, {
      issuer, audience, requiredClaims: ['sub', 'exp', 'iat'], maxTokenAge: '15m',
    });
    if (typeof claims.sub !== 'string' || !allowed.has(claims.sub)) deny();
    return claims.sub;
  };
}
