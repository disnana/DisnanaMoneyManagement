import { beforeEach, describe, expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  alert: vi.fn(),
  setColorScheme: vi.fn(),
  vibrate: vi.fn(() => Promise.resolve()),
  authenticate: vi.fn(async () => ({ success: true })),
}));
vi.mock('./kv', () => ({ kv: device }));
vi.mock('react', () => ({
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 31 },
  Alert: { alert: device.alert },
  Appearance: { setColorScheme: device.setColorScheme },
}));
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
vi.mock('expo-haptics', () => ({
  AndroidHaptics: { Clock_Tick: 1 },
  performAndroidHapticsAsync: device.vibrate,
  notificationAsync: device.vibrate,
  NotificationFeedbackType: { Success: 1 },
}));
vi.mock('expo-local-authentication', () => ({
  authenticateAsync: device.authenticate,
  hasHardwareAsync: async () => true,
  isEnrolledAsync: async () => true,
}));

async function preferences() {
  const [lock, home, haptics, motion, theme] = await Promise.all([
    import('./appLock'), import('./homeAssetVisibility'), import('./haptics'), import('./motionPref'), import('./themePref'),
  ]);
  return { lock, home, haptics, motion, theme };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  device.getItem.mockReset().mockReturnValue(null);
  device.setItem.mockReset();
  device.authenticate.mockReset().mockResolvedValue({ success: true });
});

describe('mobile preferences at startup', () => {
  it('keeps a fresh installation’s normal defaults without a write', async () => {
    const { lock, home, haptics, motion, theme } = await preferences();
    expect(lock.isLockEnabled()).toBe(false);
    expect(home.useHomeAssetVisibility()[0]).toBe(false);
    expect(haptics.getHapticsEnabled()).toBe(true);
    expect(motion.useMotionPreference()[0]).toBe(false);
    expect(theme.getThemePref()).toBe('system');
    expect(device.setItem).not.toHaveBeenCalled();
  });

  it('protects balances and lock at launch when the settings database is unreadable', async () => {
    device.getItem.mockImplementation(() => { throw new Error('unreadable database'); });
    const { lock, home, haptics, motion, theme } = await preferences();
    expect(lock.isLockEnabled()).toBe(true);
    expect(home.useHomeAssetVisibility()[0]).toBe(true);
    expect(haptics.getHapticsEnabled()).toBe(false);
    expect(motion.useMotionPreference()[0]).toBe(true);
    expect(theme.getThemePref()).toBe('system');
    haptics.tick();
    haptics.success();
    expect(device.vibrate).not.toHaveBeenCalled();
    expect(device.setItem).not.toHaveBeenCalled();
    expect(device.alert).not.toHaveBeenCalled();
    device.authenticate.mockRejectedValue(new Error('auth unavailable'));
    await expect(lock.authenticate()).resolves.toBe(false);
  });

  it('can mask an already visible balance for this session when writes fail', async () => {
    const { home } = await preferences();
    device.setItem.mockImplementation(() => { throw new Error('disk full'); });
    home.useHomeAssetVisibility()[1]();
    expect(home.useHomeAssetVisibility()[0]).toBe(true);
    expect(device.alert).toHaveBeenCalledTimes(1);
  });

  it('keeps persisted preferences when an explicit settings write is denied', async () => {
    device.getItem.mockImplementation(key => key === 'dmm_haptics' ? 'off' : 'on');
    device.setItem.mockImplementation(() => { throw new Error('disk full'); });
    const { lock, home, haptics, motion } = await preferences();
    home.useHomeAssetVisibility()[1]();
    motion.useMotionPreference()[1](false);
    expect(haptics.setHapticsEnabled(true)).toBe(false);
    expect(await lock.setLockEnabled(false)).toBe(false);
    expect(home.useHomeAssetVisibility()[0]).toBe(true);
    expect(motion.useMotionPreference()[0]).toBe(true);
    expect(haptics.getHapticsEnabled()).toBe(false);
    expect(lock.isLockEnabled()).toBe(true);
    expect(device.alert).toHaveBeenCalledTimes(4);
  });
});
