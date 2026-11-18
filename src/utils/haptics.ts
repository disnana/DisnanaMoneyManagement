/**
 * Haptic feedback.
 *  - Android / Chromium: Vibration API.
 *  - iOS Safari 18+ (incl. home-screen PWAs): toggling a native <input type=checkbox switch>
 *    fires the system's selection haptic. We click a hidden one inside a user gesture.
 */
let iosSwitch: HTMLLabelElement | null = null;

function iosTick(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    if (!iosSwitch) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText =
        'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitch = label;
    }
    iosSwitch.click();
    return true;
  } catch {
    return false;
  }
}

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function haptic(ms: number = 8): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
      return;
    }
    if (isIOS) iosTick();
  } catch {
    // ignore
  }
}
