// Adapter prototype. The caller supplies the verified Access identity and private ledger binding.
const security = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

const escape = (value) => String(value).replace(/[&<>"']/g, (character) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function response(body, status, type = 'text/plain; charset=utf-8') {
  return new Response(body, { status, headers: { ...security, 'Content-Type': type } });
}

function approvalPage({ manifest: m, hash }) {
  const rows = [
    ['パッケージ', m.packageName], ['バージョン', `${m.versionName} (${m.versionCode})`],
    ['配布先', `クローズドテスト・${m.targetTrack}・下書き`], ['コミット', m.commitSha],
    ['ビルド実行', `${m.buildRunId} / ${m.buildRunAttempt}`], ['検証実行', m.verifierRunId],
    ['未署名AAB SHA-256', m.unsignedAabSha256], ['独立検証証明 SHA-256', m.artifactProofSha256],
    ['監査資料 SHA-256', m.auditReportSha256], ['SBOM SHA-256', m.sbomSha256],
    ['照合ハッシュ', hash], ['期限', m.expiresAt],
  ];
  const code = hash.slice(0, 12).toUpperCase().match(/.{4}/g).join('-');
  return `<!doctype html><html lang="ja"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/approve.css"><script src="/approve.js" defer></script>
<title>マネーちゃんのリリース承認</title>
<main data-hash="${escape(hash)}">
<h1>リリース承認</h1>
<p>Actionsの確認コードと見比べてください。</p>
<strong class="code">${escape(code)}</strong>
<dl>${rows.map(([key, value]) => `<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`).join('')}</dl>
<p id="status" role="status">内容を確認してから進んでください。</p>
<button id="arm">リリース承認に進む</button>
<button id="hold" hidden>3秒長押しで承認</button>
<progress id="progress" max="3000" value="0" hidden aria-label="長押しの進捗"></progress>
<button id="reject">このリリースを拒否する</button>
<noscript>承認操作にはJavaScriptが必要です。</noscript>
</main></html>`;
}

async function readBody(request, operation) {
  if (request.headers.get('Content-Type') !== 'application/json' || !request.body) throw new Error('Expected JSON');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let wire = '';
  let count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.length;
      if (count > 1024) {
        await reader.cancel();
        throw new Error('Approval request too large');
      }
      wire += decoder.decode(value, { stream: true });
    }
    wire += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  const payload = JSON.parse(wire);
  const expected = operation === 'confirm'
    ? { hash: payload.hash, nonce: payload.nonce } : { hash: payload.hash };
  if (typeof payload.hash !== 'string' || !/^[a-f0-9]{64}$/.test(payload.hash) || JSON.stringify(expected) !== wire
    || (operation === 'confirm' && (typeof payload.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(payload.nonce)))) {
    throw new Error('Invalid approval payload');
  }
  return expected;
}

export function makeApprovalHandler({ origin, authenticate, ledger, assets }) {
  if (new URL(origin).origin !== origin || !origin.startsWith('https://')) {
    throw new Error('Approval requires an exact HTTPS origin');
  }
  return async function handle(request) {
    const url = new URL(request.url);
    if (url.origin !== origin || url.search) return response('Not found', 404);
    const route = /^\/approve\/([a-f0-9]{32})(?:\/(arm|confirm|reject))?$/.exec(url.pathname);
    const asset = request.method === 'GET' && Object.hasOwn(assets, url.pathname);
    const view = request.method === 'GET' && route && !route[2];
    const change = request.method === 'POST' && route?.[2];
    if (!asset && !view && !change) return response('Not found', 404);
    if (change && (request.headers.get('Origin') !== origin
      || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin'))) {
      return response('Forbidden', 403);
    }
    let administrator;
    try { administrator = await authenticate(request.headers); } catch { return response('Not found', 404); }
    if (asset) return response(assets[url.pathname].body, 200, assets[url.pathname].type);
    const [, releaseId, operation] = route;
    if (view) {
      try { return response(approvalPage(await ledger.approvalView(releaseId, administrator)), 200, 'text/html; charset=utf-8'); }
      catch { return response('Not found', 404); }
    }
    try {
      const { hash, nonce } = await readBody(request, operation);
      if (operation === 'arm') {
        const approvalNonce = await ledger.arm(releaseId, hash, administrator);
        return response(JSON.stringify({ nonce: approvalNonce }), 200, 'application/json');
      }
      if (operation === 'confirm') await ledger.confirm(releaseId, hash, administrator, nonce);
      else await ledger.reject(releaseId, hash, administrator);
      return response(null, 204);
    } catch {
      return response('Approval unavailable', 409);
    }
  };
}
