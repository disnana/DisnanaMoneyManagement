import { internalDraftTrack, isAutomatedPlayRelease, manifestWire, randomId, readManifest, sha256Hex } from './manifest.mjs';

const minute = 60_000;
const zeroHash = '0'.repeat(64);
const trackBlacklist = new Set(['production', 'open', 'beta', 'internal', 'qa', 'default']);
const releasable = new Set(['REJECTED', 'EXPIRED', 'FAILED']);

function requireRule(condition, message) {
  if (!condition) throw new Error(message);
}

export const schema = [
  'CREATE TABLE IF NOT EXISTS releases (id TEXT PRIMARY KEY, state TEXT NOT NULL, payload TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL)',
];

/** Internal state only: caller identities must originate in authenticated adapters, never request JSON. */
export class ReleaseLedger {
  constructor(sql, transactionSync, policy, clock = Date.now) {
    this.sql = sql;
    this.transactionSync = transactionSync;
    this.policy = policy;
    this.clock = clock;
    for (const statement of schema) sql.exec(statement);
  }

  read(releaseId) {
    const row = this.sql.exec('SELECT payload FROM releases WHERE id = ?', releaseId).toArray()[0];
    return row ? JSON.parse(row.payload) : undefined;
  }

  head() {
    return this.sql.exec('SELECT seq, hash FROM audit ORDER BY seq DESC LIMIT 1').toArray()[0]
      ?? { seq: 0, hash: zeroHash };
  }

  auditEvents() {
    return this.sql.exec('SELECT seq, body, hash FROM audit ORDER BY seq').toArray();
  }

  async mutate(releaseId, operation) {
    if (!/^[0-9a-f]{32}$/.test(releaseId)) throw new Error('Invalid release ID');
    for (let attempt = 0; attempt < 4; attempt++) {
      const previous = this.head();
      const current = this.read(releaseId);
      const now = this.clock();
      const { record, event, response } = operation(current, now);
      if (!event) return response;
      const seq = previous.seq + 1;
      const body = JSON.stringify({
        seq, eventId: randomId(), time: new Date(now).toISOString(),
        previousHash: previous.hash, releaseId, releaseHash: record.hash, event, state: record.state,
      });
      const hash = await sha256Hex(body);
      // Digest uses Web Crypto outside SQL. The head comparison makes both writes atomic.
      const applied = this.transactionSync(() => {
        if (this.head().seq !== previous.seq) return false;
        // Fail closed if time-sensitive policy changed while awaiting the audit digest.
        const atCommit = this.clock();
        if (atCommit !== now) {
          const checked = operation(current, atCommit);
          if (checked.event?.type !== event.type) return false;
        }
        this.sql.exec('INSERT INTO audit(seq, body, hash) VALUES (?, ?, ?)', seq, body, hash);
        this.sql.exec('INSERT INTO releases(id, state, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET state=excluded.state, payload=excluded.payload',
          releaseId, record.state, JSON.stringify(record));
        return true;
      });
      if (applied) return response;
    }
    throw new Error('Release state changed concurrently');
  }

  checkPolicy(manifest, now) {
    const p = this.policy;
    requireRule(
      !p.disabled() && (manifest.releaseStatus === 'internal-draft' ? p.track === internalDraftTrack : !trackBlacklist.has(p.track.toLowerCase())) && manifest.targetTrack === p.track
      && manifest.releaseStatus === (p.releaseStatus ?? 'draft')
      && (!p.sourceCommitSha || manifest.commitSha === p.sourceCommitSha)
      && manifest.appId === p.appId && manifest.packageName === p.packageName
      && manifest.keyId === p.keyId && manifest.uploadCertificateSha256 === p.certificate
      && manifest.policyVersion === p.version && manifest.repositoryId === p.repositoryId,
      'Release policy mismatch or signing disabled',
    );
    const start = Date.parse(manifest.issuedAt);
    const end = Date.parse(manifest.expiresAt);
    requireRule(start <= now && start < end && end - start <= 15 * minute && now < end, 'Release has expired');
  }

  async register(wire, principal) {
    const manifest = readManifest(wire);
    requireRule(principal.role === 'verifier' && principal.repositoryId === manifest.repositoryId
      && principal.runId === manifest.verifierRunId && principal.workflowSha === manifest.verifierWorkflowSha
      && (principal.commitSha === manifest.commitSha || this.policy.sourceCommitSha === manifest.commitSha),
    'Verifier proof identity mismatch');
    const hash = await sha256Hex(wire);
    this.checkPolicy(manifest, this.clock());
    const candidates = this.sql.exec(
      "SELECT id FROM releases WHERE json_extract(payload, '$.manifest.versionCode') = ? AND state IN (?, ?, ?)",
      manifest.versionCode, 'AWAITING_APPROVAL', 'ARMED', 'APPROVED',
    ).toArray();
    for (const { id } of candidates) await this.expirePending(id);
    return this.mutate(manifest.releaseId, (record, now) => {
      this.checkPolicy(manifest, now);
      if (record) {
        requireRule(record.hash === hash, 'Release ID cannot be reassigned');
        return { response: hash };
      }
      const day = new Date(now).toISOString().slice(0, 10);
      const used = this.sql.exec('SELECT COUNT(*) AS count FROM audit WHERE json_extract(body, \'$.event.type\') = ? AND substr(json_extract(body, \'$.time\'),1,10) = ?',
        'registered', day).toArray()[0].count;
      requireRule(used < 10, 'Daily release budget exhausted');
      const versionUsed = this.sql.exec('SELECT payload FROM releases WHERE json_extract(payload, \'$.manifest.versionCode\') = ?', manifest.versionCode)
        .toArray().some((row) => !releasable.has(JSON.parse(row.payload).state));
      requireRule(!versionUsed, 'Version code already reserved');
      return {
        record: { manifest, hash, state: 'AWAITING_APPROVAL', verifierCallerSha: principal.callerWorkflowSha },
        event: {
          type: 'registered', repositoryId: manifest.repositoryId, commitSha: manifest.commitSha,
          buildRunId: manifest.buildRunId, buildRunAttempt: manifest.buildRunAttempt,
          buildWorkflowSha: manifest.buildWorkflowSha, runId: principal.runId, workflowSha: principal.workflowSha,
          callerWorkflowSha: principal.callerWorkflowSha,
          artifactId: manifest.artifactId, unsignedAabSha256: manifest.unsignedAabSha256,
          signingInputSha256: manifest.signingInputSha256, buildProofSha256: manifest.buildProofSha256,
          artifactProofSha256: manifest.artifactProofSha256, policyVersion: manifest.policyVersion,
        },
        response: hash,
      };
    });
  }

  async expirePending(releaseId) {
    return this.mutate(releaseId, (record, now) => {
      if (!record || !['AWAITING_APPROVAL', 'ARMED', 'APPROVED'].includes(record.state)
        || now < Date.parse(record.manifest.expiresAt)) return {};
      const { approvalNonce: discarded, ...expired } = record;
      return { record: { ...expired, state: 'EXPIRED' }, event: { type: 'expired' } };
    });
  }

  async approvalView(releaseId, administrator) {
    requireRule(this.policy.isAdministrator(administrator), 'Administrator required');
    return this.mutate(releaseId, (record, now) => {
      requireRule(record && ['AWAITING_APPROVAL', 'ARMED'].includes(record.state), 'Approval unavailable');
      this.checkPolicy(record.manifest, now);
      return {
        record, event: { type: 'approval_page_viewed', administrator },
        response: { manifest: record.manifest, hash: record.hash },
      };
    });
  }

  async reject(releaseId, hash, administrator) {
    requireRule(this.policy.isAdministrator(administrator), 'Administrator required');
    return this.mutate(releaseId, (record, now) => {
      requireRule(record?.hash === hash && ['AWAITING_APPROVAL', 'ARMED'].includes(record.state), 'Approval unavailable');
      this.checkPolicy(record.manifest, now);
      const { approvalNonce: discarded, ...rejected } = record;
      return { record: { ...rejected, state: 'REJECTED' }, event: { type: 'rejected', administrator } };
    });
  }

  async arm(releaseId, hash, administrator) {
    requireRule(this.policy.isAdministrator(administrator), 'Administrator required');
    const nonce = randomId();
    return this.mutate(releaseId, (record, now) => {
      requireRule(record?.hash === hash && ['AWAITING_APPROVAL', 'ARMED'].includes(record.state), 'Release cannot be armed');
      this.checkPolicy(record.manifest, now);
      if (record.state === 'ARMED' && now < record.armedAt + minute) {
        requireRule(record.administrator === administrator, 'Release already armed by another administrator');
        return { response: record.approvalNonce };
      }
      return {
        record: { ...record, state: 'ARMED', administrator, approvalNonce: nonce, armedAt: now },
        event: { type: 'armed', administrator }, response: nonce,
      };
    });
  }

  async confirm(releaseId, hash, administrator, nonce) {
    requireRule(this.policy.isAdministrator(administrator), 'Administrator required');
    return this.mutate(releaseId, (record, now) => {
      requireRule(record?.hash === hash && record.state === 'ARMED' && record.administrator === administrator
        && record.approvalNonce === nonce, 'Approval does not match the armed request');
      this.checkPolicy(record.manifest, now);
      requireRule(now >= record.armedAt + 8000 && now < record.armedAt + minute, 'Approval timing outside policy');
      const { approvalNonce: discarded, ...approved } = record;
      const dispatch = this.policy.autoDispatch?.() && isAutomatedPlayRelease(approved.manifest) ? 'QUEUED' : undefined;
      return {
        record: { ...approved, state: 'APPROVED', approvedAt: now, dispatch },
        event: { type: 'approved', administrator },
      };
    });
  }

  pendingDispatchIds() {
    return this.sql.exec("SELECT id FROM releases WHERE json_extract(payload, '$.dispatch') = 'QUEUED'")
      .toArray().map(({ id }) => id);
  }

  async beginDispatch(releaseId) {
    return this.mutate(releaseId, (record, now) => {
      if (record?.dispatch !== 'QUEUED') return {};
      if (record.state !== 'APPROVED' || !this.policy.autoDispatch?.() || this.policy.disabled()
        || now >= Math.min(Date.parse(record.manifest.expiresAt), record.approvedAt + 5 * minute)) {
        return { record: { ...record, dispatch: 'SKIPPED' }, event: { type: 'dispatch_skipped' } };
      }
      try { this.checkPolicy(record.manifest, now); }
      catch { return { record: { ...record, dispatch: 'SKIPPED' }, event: { type: 'dispatch_skipped' } }; }
      const { buildRunId, verifierRunId, verifierWorkflowSha } = record.manifest;
      return {
        record: { ...record, dispatch: 'STARTED' }, event: { type: 'dispatch_started', verifierRunId },
        response: { buildRunId, verifierRunId, workflowSha: record.verifierCallerSha ?? verifierWorkflowSha },
      };
    });
  }

  async finishDispatch(releaseId, result) {
    requireRule(['sent', 'failed', 'unknown'].includes(result), 'Invalid dispatch result');
    return this.mutate(releaseId, (record) => {
      if (record?.dispatch !== 'STARTED') return {};
      return { record: { ...record, dispatch: result.toUpperCase() }, event: { type: `dispatch_${result}` } };
    });
  }

  async beginSigning(releaseId, hash, actualInput, principal) {
    requireRule(principal.role === 'signer' && this.policy.isSigner(principal), 'Signing worker required');
    requireRule(actualInput instanceof Uint8Array && actualInput.length > 0 && actualInput.length <= 65536, 'Invalid signing input size');
    const inputHash = await sha256Hex(actualInput);
    const attemptId = randomId();
    return this.mutate(releaseId, (record, now) => {
      requireRule(record?.hash === hash && record.manifest.signingInputSha256 === inputHash
        && record.manifest.signingInputLength === actualInput.length, 'Signing input does not match verifier evidence');
      if (this.policy.requireFinalizer) {
        const finalizer = principal.finalizer;
        requireRule(finalizer?.role === 'finalizer' && finalizer.repositoryId === record.manifest.repositoryId
          && (finalizer.commitSha === record.manifest.commitSha || this.policy.sourceCommitSha === record.manifest.commitSha)
          && finalizer.runId !== record.manifest.verifierRunId, 'Finalizer does not match release');
      }
      requireRule(!this.policy.disabled(), 'Signing is disabled');
      if (record.state === 'SIGNED') {
        this.checkPolicy(record.manifest, now);
        return { response: { status: 'cached', signature: record.signature, signatureHash: record.signatureHash } };
      }
      if (record.state === 'SIGNING' && now >= record.signingUntil) {
        return {
          record: { ...record, state: 'QUARANTINED' },
          event: { type: 'sign_outcome_unknown', attemptId: record.attemptId },
          response: { status: 'quarantined' },
        };
      }
      this.checkPolicy(record.manifest, now);
      requireRule(record.state === 'APPROVED' && now < record.approvedAt + 5 * minute, 'Approval is unavailable');
      const busy = this.sql.exec('SELECT id FROM releases WHERE state = ? LIMIT 1', 'SIGNING').toArray()[0];
      requireRule(!busy, 'Another signature is in progress');
      return {
        record: {
          ...record, state: 'SIGNING', attemptId, signingUntil: now + minute,
          finalizerRunId: principal.finalizer?.runId, finalizerRunAttempt: principal.finalizer?.runAttempt,
        },
        event: {
          type: 'sign_started', attemptId, inputHash, keyId: record.manifest.keyId,
          finalizerRunId: principal.finalizer?.runId, finalizerRunAttempt: principal.finalizer?.runAttempt,
          finalizerWorkflowSha: principal.finalizer?.workflowSha,
        },
        response: { status: 'reserved', attemptId },
      };
    });
  }

  async finishSigning(releaseId, attemptId, signature, principal) {
    requireRule(principal.role === 'signer' && this.policy.isSigner(principal), 'Signing worker required');
    requireRule(signature instanceof Uint8Array && signature.length === this.policy.signatureLength, 'Unexpected RSA signature size');
    const signatureHash = await sha256Hex(signature);
    const encoded = btoa(String.fromCharCode(...signature));
    return this.mutate(releaseId, (record, now) => {
      requireRule(record?.state === 'SIGNING' && record.attemptId === attemptId && now < record.signingUntil, 'Signature reservation is unavailable');
      this.checkPolicy(record.manifest, now);
      return {
        record: { ...record, state: 'SIGNED', signature: encoded, signatureHash },
        event: { type: 'signed', attemptId, signatureHash }, response: signatureHash,
      };
    });
  }

  recordPlayUpload(releaseId, report, publisher) {
    return this.mutate(releaseId, (record, now) => {
      requireRule(record?.hash === report.releaseHash && record.signatureHash === report.signatureHash
        && record.manifest.versionCode === report.versionCode && isAutomatedPlayRelease(record.manifest),
      'Upload evidence does not match the signed release');
      requireRule(publisher.role === 'publisher' && publisher.repositoryId === record.manifest.repositoryId
        && publisher.runId === record.finalizerRunId && publisher.runAttempt === record.finalizerRunAttempt
        && (publisher.commitSha === record.manifest.commitSha || this.policy.sourceCommitSha === record.manifest.commitSha),
      'Publisher does not match the signing run');
      if (report.phase === 'start') {
        this.checkPolicy(record.manifest, now);
        requireRule(record.state === 'SIGNED', 'Upload has already started or been recorded');
        return {
          record: { ...record, state: 'UPLOADING', signedAabSha256: report.signedAabSha256 },
          event: { type: 'upload_started', signedAabSha256: report.signedAabSha256, versionCode: report.versionCode,
            runId: publisher.runId, runAttempt: publisher.runAttempt, workflowSha: publisher.workflowSha },
          response: { status: 'reserved' },
        };
      }
      requireRule(report.phase === 'finish' && ['stored', 'already_present'].includes(report.result)
        && record.signedAabSha256 === report.signedAabSha256, 'Upload result differs from its reservation');
      if (record.state === 'UPLOADED' && record.uploadResult === report.result) {
        return { response: { status: 'recorded' } };
      }
      requireRule(record.state === 'UPLOADING', 'No matching upload reservation');
      return {
        record: { ...record, state: 'UPLOADED', uploadResult: report.result, uploadedAt: now },
        event: { type: 'upload_result', result: report.result, signedAabSha256: report.signedAabSha256,
          versionCode: report.versionCode, runId: publisher.runId, runAttempt: publisher.runAttempt },
        response: { status: 'recorded' },
      };
    });
  }
}
