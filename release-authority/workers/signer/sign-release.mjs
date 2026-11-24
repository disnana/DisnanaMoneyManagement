const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };

/** Private signer core. Provision its ledger capability and key policy outside the gateway. */
export function makeReleaseSigner({ ledger, principal, loadPrivateKey, publicKey, disabled }) {
  return async function signRelease(releaseId, releaseHash, input) {
    if (disabled()) throw new Error('Signing is disabled');
    if (!(input instanceof Uint8Array) || !input.length || input.length > 65536 || input[0] !== 0x31) {
      throw new Error('Expected bounded CMS signed attributes');
    }
    const bytes = new Uint8Array(input);
    const reservation = await ledger.beginSigning(releaseId, releaseHash, bytes, principal);
    if (reservation.status !== 'reserved') return reservation;

    // A failure after reservation is uncertain. The ledger will quarantine it rather than retry.
    const privateKey = await loadPrivateKey();
    if (disabled()) throw new Error('Signing is disabled');
    const signature = new Uint8Array(await crypto.subtle.sign(algorithm.name, privateKey, bytes));
    if (!await crypto.subtle.verify(algorithm.name, publicKey, signature, bytes)) {
      throw new Error('Signature does not match the configured upload key');
    }
    const signatureHash = await ledger.finishSigning(releaseId, reservation.attemptId, signature, principal);
    return { status: 'signed', signature: btoa(String.fromCharCode(...signature)), signatureHash };
  };
}
