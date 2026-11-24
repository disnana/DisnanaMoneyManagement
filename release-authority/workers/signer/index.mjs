import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import { ReleaseLedger } from '../../packages/protocol/ledger.mjs';
import { makeAccessAuthenticator, makeCiAuthenticator } from '../../packages/verification/identity.mjs';
import { makeApprovalHandler } from '../approval/handler.mjs';
import approveScript from '../approval/approve.js.txt';
import approveStyle from '../approval/approve.css.txt';
import { makeVerifierIntake } from './intake.mjs';
import { makeFinalizeIntake } from './finalize-intake.mjs';
import { makeReleaseSigner } from './sign-release.mjs';

const assets = {
  '/approve.js': { body: approveScript, type: 'application/javascript; charset=utf-8' },
  '/approve.css': { body: approveStyle, type: 'text/css; charset=utf-8' },
};
const instances = new WeakMap();
const signingAlgorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };

function signerPolicy(env) {
  const release = JSON.parse(env.RELEASE_POLICY);
  const access = JSON.parse(env.ACCESS_POLICY);
  if (typeof release.appId !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(release.appId)
      || (release.sourceCommitSha !== undefined && !/^[a-f0-9]{40}$/.test(release.sourceCommitSha))
      || !Array.isArray(access.administrators)) throw new Error('Invalid release authority configuration');
  return {
    release, access,
    ledger: () => env.RELEASE_LEDGER.get(env.RELEASE_LEDGER.idFromName(release.appId)),
  };
}

function getHandlers(env) {
  if (!instances.has(env)) {
    if (env.APPROVAL_ORIGIN === env.VERIFIER_ORIGIN) throw new Error('Release authority origins must be distinct');
    const { access, ledger, release } = signerPolicy(env);
    const authenticateAdmin = makeAccessAuthenticator(access);
    const verifierPolicy = JSON.parse(env.VERIFIER_POLICY);
    if (release.sourceCommitSha && !verifierPolicy.callerSha) throw new Error('Historical source requires a fixed verifier caller');
    const authenticateVerifier = makeCiAuthenticator({ ...verifierPolicy, role: 'verifier' });
    const approval = makeApprovalHandler({
      origin: env.APPROVAL_ORIGIN, authenticate: authenticateAdmin, assets,
      ledger: {
        approvalView: (...args) => ledger().approvalView(...args),
        arm: (...args) => ledger().arm(...args),
        confirm: (...args) => ledger().confirm(...args),
        reject: (...args) => ledger().reject(...args),
      },
    });
    const verifier = makeVerifierIntake({ origin: env.VERIFIER_ORIGIN, authenticate: authenticateVerifier, ledger });
    instances.set(env, { approval, verifier, ledger, release });
  }
  return instances.get(env);
}

export class ApprovalIntake extends WorkerEntrypoint {
  fetch(request) { return getHandlers(this.env).approval(request); }
}

export class VerifierIntake extends WorkerEntrypoint {
  fetch(request) { return getHandlers(this.env).verifier(request); }
}
export class FinalizerIntake extends WorkerEntrypoint {
  fetch(request) {
    const state = getHandlers(this.env);
    if (!this.env.FINALIZER_POLICY) return new Response('Not found', { status: 404 });
    if (!state.finalizer) {
      const finalizerPolicy = JSON.parse(this.env.FINALIZER_POLICY);
      if (state.release.sourceCommitSha && !finalizerPolicy.callerSha) {
        throw new Error('Historical source requires a fixed finalizer caller');
      }
      state.finalizer = makeFinalizeIntake({
        origin: this.env.VERIFIER_ORIGIN, ledger: state.ledger,
        authenticate: makeCiAuthenticator({ ...finalizerPolicy, role: 'finalizer' }),
      });
    }
    return state.finalizer(request);
  }
}

// This namespace belongs only to the Signer. No externally bound entrypoint exposes it.
export class SignerLedger extends DurableObject {
  #ledger;
  #signers = new WeakSet();
  #keyPair;
  constructor(ctx, env) {
    super(ctx, env);
    const { release, access } = signerPolicy(env);
    const rsaBits = release.rsaBits ?? 3072;
    if (![2048, 3072, 4096].includes(rsaBits)) throw new Error('Invalid RSA key size');
    this.#ledger = new ReleaseLedger(ctx.storage.sql, (action) => ctx.storage.transactionSync(action), {
      ...release,
      signatureLength: rsaBits / 8,
      requireFinalizer: true,
      disabled: () => env.RELEASE_INTAKE_ENABLED !== 'true',
      isAdministrator: (id) => access.administrators.includes(id),
      isSigner: (principal) => this.#signers.has(principal),
    });
  }
  register(wire, principal) { return this.#ledger.register(wire, principal); }
  approvalView(id, administrator) { return this.#ledger.approvalView(id, administrator); }
  arm(id, hash, administrator) { return this.#ledger.arm(id, hash, administrator); }
  confirm(id, hash, administrator, nonce) { return this.#ledger.confirm(id, hash, administrator, nonce); }
  reject(id, hash, administrator) { return this.#ledger.reject(id, hash, administrator); }

  async #loadSigningKeys() {
    const certificate = new X509Certificate(this.env.UPLOAD_CERTIFICATE_PEM);
    const fingerprint = certificate.fingerprint256.replaceAll(':', '').toLowerCase();
    if (fingerprint !== this.#ledger.policy.certificate
      || certificate.publicKey.asymmetricKeyDetails?.modulusLength !== this.#ledger.policy.signatureLength * 8) {
      throw new Error('Upload certificate does not match release policy');
    }
    const spki = certificate.publicKey.export({ type: 'spki', format: 'der' });
    const publicKey = await crypto.subtle.importKey('spki', spki, signingAlgorithm, false, ['verify']);
    let privateKey;
    return {
      publicKey,
      loadPrivateKey: () => {
        privateKey ??= (async () => {
          const key = createPrivateKey(this.env.UPLOAD_PRIVATE_KEY_PEM);
          if (!createPublicKey(key).equals(certificate.publicKey)) {
            throw new Error('Upload private key does not match the configured certificate');
          }
          const pkcs8 = key.export({ type: 'pkcs8', format: 'der' });
          try {
            return await crypto.subtle.importKey('pkcs8', pkcs8, signingAlgorithm, false, ['sign']);
          } finally {
            pkcs8.fill(0);
          }
        })();
        return privateKey;
      },
    };
  }

  async signApproved(id, hash, input, finalizer) {
    if (this.env.RELEASE_SIGNING_ENABLED !== 'true' || this.#ledger.policy.disabled()) {
      throw new Error('Signing is disabled');
    }
    this.#keyPair ??= this.#loadSigningKeys();
    const keys = await this.#keyPair;
    const principal = Object.freeze({ role: 'signer', finalizer });
    this.#signers.add(principal);
    try {
      return await makeReleaseSigner({
        ...keys, ledger: this.#ledger, principal,
        disabled: () => this.env.RELEASE_SIGNING_ENABLED !== 'true' || this.#ledger.policy.disabled(),
      })(id, hash, input);
    } finally {
      this.#signers.delete(principal);
    }
  }
}

export default {
  fetch() {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  },
};
