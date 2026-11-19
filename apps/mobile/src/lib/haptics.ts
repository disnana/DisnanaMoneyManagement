import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { kv } from '@/lib/kv';

const HAPTIC_KEY = 'dmm_haptics';
let enabled: boolean | undefined;

export function getHapticsEnabled(): boolean {
  if (enabled === undefined) enabled = kv.getItem(HAPTIC_KEY) !== 'off';
  return enabled;
}

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
  kv.setItem(HAPTIC_KEY, value ? 'on' : 'off');
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
