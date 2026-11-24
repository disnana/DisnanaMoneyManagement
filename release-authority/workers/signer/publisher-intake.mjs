import { readManifestBody } from './intake.mjs';

const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function makePublisherIntake({ origin, authenticate, ledger }) {
  return async function handle(request) {
    const url = new URL(request.url);
    const route = /^\/v1\/releases\/([a-f0-9]{32})\/upload$/.exec(url.pathname);
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (request.method !== 'POST' || url.origin !== origin || url.search || !route) {
      return new Response('Not found', { status: 404, headers });
    }
    let principal;
    try {
      principal = await authenticate(request.headers);
      if (principal.role !== 'publisher') throw new Error('Publisher identity required');
    } catch {
      return new Response('Not found', { status: 404, headers });
    }
    try {
      const report = JSON.parse(await readManifestBody(request));
      const start = report?.phase === 'start' && Object.keys(report).length === 5;
      const finish = report?.phase === 'finish' && Object.keys(report).length === 6
        && ['stored', 'already_present'].includes(report.result);
      if ((!start && !finish) || ![report.releaseHash, report.signatureHash, report.signedAabSha256].every(hash)
        || !Number.isSafeInteger(report.versionCode) || report.versionCode < 1 || report.versionCode > 2_100_000_000) {
        throw new Error('Invalid upload evidence');
      }
      return Response.json(await ledger().recordPlayUpload(route[1], report, principal), { headers });
    } catch {
      return new Response('Release unavailable', { status: 409, headers });
    }
  };
}
