import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  device: { loadSession: vi.fn(), saveSession: vi.fn(), signChallenge: vi.fn(), clearGoogleState: vi.fn() },
}));
vi.mock('expo', () => ({ requireOptionalNativeModule: () => mocks.device }));
vi.mock('expo-file-system', () => ({}));
vi.mock('expo/fetch', () => ({ fetch: mocks.fetch }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { maneAuth: { entry: 'https://auth.test' } } } },
}));
vi.mock('react', () => ({ useSyncExternalStore: (_subscribe, snapshot) => snapshot() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@noble/hashes/sha2.js', async () => {
  const { createHash } = await import('node:crypto');
  return { sha256: (bytes) => createHash('sha256').update(bytes).digest() };
});
vi.mock('@noble/hashes/utils.js', () => ({
  bytesToHex: (bytes) => Buffer.from(bytes).toString('hex'),
  utf8ToBytes: (value) => new TextEncoder().encode(value),
}));

const origin = 'https://node-a.test';
const jobID = 'client-job-42';
const jobPath = '/v1/ai/receipt-jobs/' + jobID;
const config = {
  price_version: 'staging-1', credits_per_image: 2, max_groups: 4, max_images_per_group: 4, max_total_images: 8,
  max_image_bytes: 100_000, max_total_image_bytes: 500_000, max_image_pixels: 200_000, max_json_bytes: 700_000,
};
const modes = [
  { id: 'standard', price_version: 'staging-1', max_wait_seconds: 300, millicredits_per_image: 2_000 },
  { id: 'background', price_version: 'staging-background', max_wait_seconds: 28_800, millicredits_per_image: 750 },
  { id: 'batch', price_version: 'staging-batch', max_wait_seconds: 86_400, millicredits_per_image: 400 },
];
const input = {
  maximum_credit: 2, price_version: 'staging-1', request: {
    groups: [{ id: 'folder-1', images: [{ id: 'image-1', mime_type: 'image/jpeg', data: 'abcd' }] }],
  },
};
const job = {
  id: jobID, state: 'PROCESSING', accepted: true, settled: false, price_version: config.price_version,
  maximum_credit: 2, final_credit: null, groups: [{ id: 'folder-1', state: 'PROCESSING' }],
};
const session = {
  issuer_node_id: 'a', origin, session_id: 'session-a', access_token: 'access-a', refresh_token: 'refresh-a',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

function challenge(init, node) {
  const { operation } = JSON.parse(init.body);
  return Response.json({
    challenge: 'challenge', request_id: 'proof-request', issuer_node_id: node,
    expires_in_ms: operation.method === 'POST' && operation.path === jobPath ? 60_000 : 5_000,
  });
}

beforeEach(() => {
  vi.resetModules();
  mocks.fetch.mockReset();
  mocks.device.signChallenge.mockReset().mockResolvedValue('device-signature');
  mocks.device.loadSession.mockReset().mockResolvedValue(JSON.stringify(session));
  mocks.device.saveSession.mockReset().mockResolvedValue(undefined);
});

describe('authenticated Android receipt jobs', () => {
  it('uses the assigned node, 60-second upload proof and a stable job path', async () => {
    mocks.fetch.mockImplementation(async (url, init) => {
      expect(String(url)).toMatch(/^https:\/\/node-a\.test\//);
      if (url.endsWith('/auth/challenge')) return challenge(init, 'a');
      if (url.endsWith('/receipt-config')) return Response.json(config);
      expect(url).toBe(origin + jobPath);
      expect(init.headers['X-Mane-Device-Signature']).toBe('device-signature');
      expect(init.headers['Authorization']).toBe('Bearer access-a');
      if (init.method === 'POST') {
        expect(init.body).toBe(JSON.stringify(input));
        return Response.json(job, { status: 202 });
      }
      return Response.json({ ...job, state: 'PARTIAL', settled: true, final_credit: 1 });
    });
    const api = await import('./androidReceiptClient');
    expect(await api.getReceiptConfig()).toEqual(config);
    expect(await api.submitReceiptJob(jobID, input)).toEqual(job);
    const result = await api.getReceiptJob(jobID);
    expect(api.isReceiptJobTerminal(result.state)).toBe(true);
    expect(api.isReceiptJobTerminal('SUBMISSION_UNKNOWN')).toBe(false);
  });

  it('never replays an upload that may have committed and retrieves it by the same ID', async () => {
    mocks.fetch.mockImplementation(async (url, init) => {
      if (url.endsWith('/auth/challenge')) return challenge(init, 'a');
      expect(url).toBe(origin + jobPath);
      if (init.method === 'POST') throw new TypeError('connection dropped after upload');
      return Response.json(job);
    });
    const api = await import('./androidReceiptClient');
    await expect(api.submitReceiptJob(jobID, input)).rejects.toMatchObject({ mayHaveCommitted: true });
    await expect(api.getReceiptJob(jobID)).resolves.toEqual(job);
    expect(mocks.fetch.mock.calls.filter(([url, init]) => url === origin + jobPath && init.method === 'POST')).toHaveLength(1);
  });

  it('checks a saved session with the gateway before sending receipt data to a direct node', async () => {
    const assigned = { ...session, issuer_node_id: 'b', origin: 'https://node-b.test', access_token: 'access-b' };
    mocks.device.loadSession.mockResolvedValue(JSON.stringify({ ...session, origin: undefined }));
    mocks.fetch.mockImplementation(async (url, init) => {
      if (url === 'https://auth.test/auth/node') return Response.json({ id: 'b', origin: assigned.origin });
      if (url.endsWith('/auth/challenge')) return challenge(init, 'b');
      if (url === assigned.origin + '/auth/refresh') return Response.json(assigned);
      expect(url).toBe(assigned.origin + jobPath);
      expect(init.headers['Authorization']).toBe('Bearer access-b');
      return Response.json(job, { status: 202 });
    });
    const api = await import('./androidReceiptClient');
    await expect(api.submitReceiptJob(jobID, input)).resolves.toEqual(job);
    const account = await import('./androidAccount');
    expect(account.useAndroidAccount().issuerNodeID).toBe('b');
  });

  it('passes through an explicit debit rejection and rejects invalid job IDs before fetching', async () => {
    mocks.fetch.mockImplementation(async (url, init) => url.endsWith('/auth/challenge')
      ? challenge(init, 'a') : Response.json({ error: 'insufficient_credit' }, { status: 402 }));
    const api = await import('./androidReceiptClient');
    await expect(api.submitReceiptJob('../wrong', input)).rejects.toMatchObject({ status: 400 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    await expect(api.submitReceiptJob(jobID, input)).rejects.toMatchObject({
      status: 402, code: 'insufficient_credit', mayHaveCommitted: false,
    });
  });

  it('reassigns if the original receipt challenge fails before the upload is sent', async () => {
    const assigned = { ...session, issuer_node_id: 'b', origin: 'https://node-b.test', access_token: 'access-b' };
    mocks.fetch.mockImplementation(async (url, init) => {
      if (url === origin + '/auth/challenge') return Response.json({}, { status: 503 });
      if (url === 'https://auth.test/auth/node') return Response.json({ id: 'b', origin: assigned.origin });
      if (url === assigned.origin + '/auth/challenge') return challenge(init, 'b');
      if (url === assigned.origin + '/auth/refresh') return Response.json(assigned);
      expect(url).toBe(assigned.origin + jobPath);
      expect(init.headers['Authorization']).toBe('Bearer access-b');
      return Response.json(job, { status: 202 });
    });
    const api = await import('./androidReceiptClient');
    await expect(api.submitReceiptJob(jobID, input)).resolves.toEqual(job);
    expect(mocks.fetch.mock.calls.filter(([url]) => url.endsWith(jobPath))).toHaveLength(1);
  });

  it('keeps available and expired credit lots separate in account state', async () => {
    const lots = [{ amount: 1 }, { amount: 2, expires_at_ms: 3_000 }];
    const expiredLots = [{ amount: 8, expires_at_ms: 1_000 }];
    const history = [{ id: 'event-1', at_ms: 2_000, operation: { kind: 'expire', amount: 8, expired_lots: expiredLots } }];
    mocks.fetch.mockImplementation(async (url, init) => {
      if (url.endsWith('/auth/challenge')) return challenge(init, 'a');
      if (url.endsWith('/v1/credits')) return Response.json({ available_credits: 3, lots, expired_lots: expiredLots, history });
      return Response.json({ subject: 'account-a' });
    });
    const account = await import('./androidAccount');
    await account.refreshAndroidAccount();
    expect(account.useAndroidAccount()).toMatchObject({ accountId: 'account-a', credits: 3, lots, expiredLots, history });
  });

  it('restores the verified account ID offline and carries it through node reassignment', async () => {
    mocks.device.loadSession.mockResolvedValue(JSON.stringify({ ...session, account_id: 'account-a' }));
    const assigned = { ...session, issuer_node_id: 'b', origin: 'https://node-b.test', access_token: 'access-b' };
    const account = await import('./androidAccount');
    await account.restoreAndroidAccount();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(account.getAndroidAccountSnapshot()).toMatchObject({ signedIn: true, accountId: 'account-a' });
    mocks.fetch.mockImplementation(async (url, init) => {
      if (url === origin + '/auth/challenge') return Response.json({}, { status: 503 });
      if (url === 'https://auth.test/auth/node') return Response.json({ id: 'b', origin: assigned.origin });
      if (url === assigned.origin + '/auth/challenge') return challenge(init, 'b');
      if (url === assigned.origin + '/auth/refresh') return Response.json({ ...assigned, account_id: 'unverified-reply' });
      if (url === assigned.origin + '/auth/logout') return new Response(null, { status: 204 });
      return Response.json(config);
    });
    const api = await import('./androidReceiptClient');
    await expect(api.getReceiptConfig()).resolves.toEqual(config);
    expect(JSON.parse(mocks.device.saveSession.mock.lastCall[0])).toMatchObject({ account_id: 'account-a', issuer_node_id: 'b' });
    await account.signOutAndroidAccount();
    expect(account.getAndroidAccountSnapshot()).toMatchObject({ signedIn: false, accountId: null });
    expect(mocks.device.saveSession.mock.lastCall[0]).toBeNull();
  });

  it('quotes and signs the selected mode once across separate documents', async () => {
    const modern = { ...config, modes };
    const groups = [
      { id: 'document-a', pages: [{ bytes: 3, type: 'image/png' }, { bytes: 4, type: 'image/jpeg' }] },
      { id: 'document-b', pages: [{ bytes: 5, type: 'image/jpeg' }] },
    ];
    const api = await import('./androidReceiptClient');
    const { buildReceiptInput } = await import('./receiptDraftFiles');
    const body = buildReceiptInput(groups, modern, 'batch');
    expect(body).toMatchObject({
      maximum_credit: 2, price_version: 'staging-batch', mode: 'batch',
      request: { groups: [
        { id: 'document-a', images: [{ id: 'g1-p1', mime_type: 'image/png', data: '' },
          { id: 'g1-p2', mime_type: 'image/jpeg', data: '' }] },
        { id: 'document-b', images: [{ id: 'g2-p1', mime_type: 'image/jpeg', data: '' }] },
      ] },
    });
    expect(api.quoteReceiptCredits(modern, 4, 'background')).toBe(3);
    expect(api.quoteReceiptCredits(modern, 1, 'batch')).toBe(1);
    expect(api.quoteReceiptCredits(modern, 0, 'batch')).toBe(0);
    expect(api.quoteReceiptCredits(modern, 3)).toBe(6);
    expect(() => api.quoteReceiptCredits(modern, 1.5, 'batch')).toThrow();
    expect(() => api.quoteReceiptCredits(modern, Number.MAX_SAFE_INTEGER, 'batch')).toThrow();
    const modeJob = { ...job, mode: 'batch', price_version: 'staging-batch' };
    mocks.fetch.mockImplementation(async (url, init) => {
      if (url.endsWith('/auth/challenge')) {
        const { operation } = JSON.parse(init.body);
        if (operation.method === 'POST') {
          expect(operation.body_sha256).toBe(createHash('sha256').update(JSON.stringify(body)).digest('hex'));
        }
        return challenge(init, 'a');
      }
      if (url.endsWith('/receipt-config')) return Response.json(modern);
      expect(init.body).toBe(JSON.stringify(body));
      return Response.json(modeJob, { status: 202 });
    });
    expect(api.getReceiptModes(await api.getReceiptConfig())).toEqual(modes);
    await expect(api.submitReceiptJob(jobID, body)).resolves.toEqual(modeJob);
    expect(api.isReceiptJob({ ...job, mode: 'unsupported' }, jobID)).toBe(false);
  });

  it('omits mode for legacy nodes and rejects invalid or duplicate tariffs', async () => {
    const api = await import('./androidReceiptClient');
    const { buildReceiptInput } = await import('./receiptDraftFiles');
    const groups = [{ id: 'document-a', pages: [{ bytes: 5, type: 'image/jpeg' }] }];
    expect(api.getReceiptModes(config)).toEqual([{ id: 'standard', price_version: 'staging-1', millicredits_per_image: 2_000 }]);
    expect(buildReceiptInput(groups, config, 'standard')).not.toHaveProperty('mode');
    expect(() => buildReceiptInput(groups, config, 'background')).toThrow();
    mocks.fetch.mockImplementation(async (url, init) => url.endsWith('/auth/challenge')
      ? challenge(init, 'a') : Response.json({ ...config, modes: [modes[0], modes[0]] }));
    await expect(api.getReceiptConfig()).rejects.toMatchObject({ code: 'invalid_receipt_response' });
    mocks.fetch.mockImplementation(async (url, init) => url.endsWith('/auth/challenge')
      ? challenge(init, 'a') : Response.json({ ...config, modes: [{ ...modes[0], millicredits_per_image: 1.5 }] }));
    await expect(api.getReceiptConfig()).rejects.toMatchObject({ code: 'invalid_receipt_response' });
  });
});
