import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { readPreference, savePreference } from './preferences';

const HAPTIC_KEY = 'dmm_haptics';
let enabled: boolean | undefined;

export function getHapticsEnabled(): boolean {
  if (enabled === undefined) {
    const value = readPreference(HAPTIC_KEY);
    enabled = value === null || value === 'on';
  }
  return enabled;
}

export function setHapticsEnabled(value: boolean): boolean {
  if (!savePreference(HAPTIC_KEY, value ? 'on' : 'off')) return false;
  enabled = value;
  return true;
}

function androidTick() {
  const clockTick = () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick);
  // Segment ticks were introduced in Android 14 (API 34).
  if (Number(Platform.Version) < 34) return clockTick();
  return Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick).catch(clockTick);
}

/** Selection tick (tabs, segmented, pickers). */
export function tick() {
  if (Platform.OS === 'web' || !getHapticsEnabled()) return;
  const feedback = Platform.OS === 'android' ? androidTick() : Haptics.selectionAsync();
  // Haptic feedback is optional and must never interrupt the action.
  void feedback.catch(() => undefined);
}

/** Confirmation (saved / deleted). */
export function success() {
  if (Platform.OS === 'web' || !getHapticsEnabled()) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
