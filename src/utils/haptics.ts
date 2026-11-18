/** Light haptic feedback where supported (Android / some browsers). Safe no-op elsewhere. */
export function haptic(ms: number = 8): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    // ignore
  }
}
