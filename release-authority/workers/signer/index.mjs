import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { ReleaseLedger } from '../../packages/protocol/ledger.mjs';
import { makeAccessAuthenticator, makeCiAuthenticator } from '../../packages/verification/identity.mjs';
import { makeApprovalHandler } from '../approval/handler.mjs';
import approveScript from '../approval/approve.js.txt';
import approveStyle from '../approval/approve.css.txt';
import { makeVerifierIntake } from './intake.mjs';

const assets = {
  '/approve.js': { body: approveScript, type: 'application/javascript; charset=utf-8' },
  '/approve.css': { body: approveStyle, type: 'text/css; charset=utf-8' },
};
const instances = new WeakMap();

function signerPolicy(env) {
  const release = JSON.parse(env.RELEASE_POLICY);
  const access = JSON.parse(env.ACCESS_POLICY);
  if (typeof release.appId !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(release.appId)
      || !Array.isArray(access.administrators)) throw new Error('Invalid release authority configuration');
  return {
    release, access,
    ledger: () => env.RELEASE_LEDGER.get(env.RELEASE_LEDGER.idFromName(release.appId)),
  };
}

function getHandlers(env) {
  if (!instances.has(env)) {
    if (env.APPROVAL_ORIGIN === env.VERIFIER_ORIGIN) throw new Error('Release authority origins must be distinct');
    const { access, ledger } = signerPolicy(env);
    const authenticateAdmin = makeAccessAuthenticator(access);
    const verifierPolicy = JSON.parse(env.VERIFIER_POLICY);
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
    instances.set(env, { approval, verifier });
  }
  return instances.get(env);
}

export class ApprovalIntake extends WorkerEntrypoint {
  fetch(request) { return getHandlers(this.env).approval(request); }
}

export class VerifierIntake extends WorkerEntrypoint {
  fetch(request) { return getHandlers(this.env).verifier(request); }
}

// This namespace belongs only to the Signer. No externally bound entrypoint exposes it.
export class SignerLedger extends DurableObject {
  #ledger;
  constructor(ctx, env) {
    super(ctx, env);
    const { release, access } = signerPolicy(env);
    this.#ledger = new ReleaseLedger(ctx.storage.sql, (action) => ctx.storage.transactionSync(action), {
      ...release,
      disabled: () => env.RELEASE_INTAKE_ENABLED !== 'true',
      isAdministrator: (id) => access.administrators.includes(id),
      isSigner: () => false,
    });
  }
  register(wire, principal) { return this.#ledger.register(wire, principal); }
  approvalView(id, administrator) { return this.#ledger.approvalView(id, administrator); }
  arm(id, hash, administrator) { return this.#ledger.arm(id, hash, administrator); }
  confirm(id, hash, administrator, nonce) { return this.#ledger.confirm(id, hash, administrator, nonce); }
  reject(id, hash, administrator) { return this.#ledger.reject(id, hash, administrator); }
}

export default {
  fetch() {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  },
};
