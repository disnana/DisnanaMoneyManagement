import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** Selection tick (tabs, segmented, pickers). */
export function tick() {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'android') void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick);
  else void Haptics.selectionAsync();
}

/** Confirmation (saved / deleted). */
export function success() {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
