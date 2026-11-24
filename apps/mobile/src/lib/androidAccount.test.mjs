import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  loadSession: vi.fn(),
  saveSession: vi.fn(),
  submitDeviceProof: vi.fn(),
  IssuerUnavailable: class extends Error {
    constructor(mayHaveCommitted) {
      super('Issuer unavailable');
      this.mayHaveCommitted = mayHaveCommitted;
    }
  },
}));

vi.mock('react', () => ({ useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { maneAuth: { entry: 'https://auth.example' } } } },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo/fetch', () => ({ fetch: mocks.fetch }));
vi.mock('./androidProof', () => ({
  getAndroidDeviceProof: () => ({ loadSession: mocks.loadSession, saveSession: mocks.saveSession }),
  submitDeviceProof: mocks.submitDeviceProof,
  IssuerUnavailable: mocks.IssuerUnavailable,
  DeviceProofHTTPError: class extends Error {},
}));

const legacySession = {
  issuer_node_id: 'staging-b', session_id: 'test-session', access_token: 'test-access',
  refresh_token: 'test-refresh', expires_at: 1,
};

describe('Android account with a saved session without a node origin', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.loadSession.mockResolvedValue(JSON.stringify(legacySession));
  });

  it('migrates an expired session to an available node after the old issuer fails', async () => {
    const node = { id: 'staging-a', origin: 'https://node-a.example' };
    const renewed = {
      ...legacySession, issuer_node_id: node.id, origin: node.origin,
      access_token: 'new-test-access', expires_at: Math.floor(Date.now() / 1000) + 600,
    };
    mocks.fetch.mockResolvedValueOnce(Response.json(node));
    mocks.submitDeviceProof
      .mockRejectedValueOnce(new mocks.IssuerUnavailable(false))
      .mockResolvedValueOnce(Response.json(renewed))
      .mockResolvedValueOnce(Response.json({ available_credits: 9 }))
      .mockResolvedValueOnce(Response.json({ subject: 'test-account' }));
    const account = await import('./androidAccount');
    await account.refreshAndroidAccount();

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url).toBe('https://auth.example/auth/node');
    expect(JSON.parse(options.body)).toEqual({
      exclude: 'staging-b', session_id: legacySession.session_id, refresh_token: legacySession.refresh_token,
    });
    const calls = mocks.submitDeviceProof.mock.calls;
    expect(calls.map(([origin, issuer, op]) => [origin, issuer, op.path])).toEqual([
      ['https://auth.example', 'staging-b', '/auth/refresh'],
      [node.origin, node.id, '/auth/refresh'],
      [node.origin, node.id, '/v1/credits'],
      [node.origin, node.id, '/v1/me'],
    ]);
    expect(mocks.saveSession).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.saveSession.mock.calls[0][0])).toEqual(renewed);
    expect(account.useAndroidAccount()).toMatchObject({ signedIn: true, accountId: 'test-account', credits: 9 });
  });

  it('keeps the session and avoids reassignment if refresh may already have committed', async () => {
    mocks.submitDeviceProof.mockRejectedValue(new mocks.IssuerUnavailable(true));
    const account = await import('./androidAccount');
    await account.refreshAndroidAccount();

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.saveSession).not.toHaveBeenCalled();
    expect(account.useAndroidAccount()).toMatchObject({ signedIn: true, credits: null });
  });
});
