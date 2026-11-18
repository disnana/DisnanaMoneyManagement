import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

/**
 * PWA update strategy (fast, but never destroys what the user is doing):
 *  - Look for a new version at launch, on every return to foreground, on reconnect and every 15 min
 *    (installed PWAs, iOS especially, otherwise only check on a cold launch).
 *  - A new version is applied immediately right after launch, or when the app returns from the
 *    background, or when the app goes to the background - never in the middle of an entry form.
 */
if (import.meta.env.PROD) {
  const bootedAt = Date.now();
  let pending = false;

  const isBusy = () => {
    const a = document.activeElement;
    const typing =
      a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
    return typing || Boolean(document.querySelector('[role="dialog"]'));
  };

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true;
      // Fresh launch: swap right away (nothing to lose yet)
      if (Date.now() - bootedAt < 8000 && !isBusy()) void updateSW(true);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        registration.update().catch(() => {
          // offline or transient network error
        });
      };
      window.setInterval(check, 15 * 60 * 1000);
      window.addEventListener('online', check);
      window.addEventListener('pageshow', check);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          // Coming back from background: a natural moment to load the new version
          if (pending && !isBusy()) void updateSW(true);
          else check();
        } else if (pending) {
          void updateSW(true);
        }
      });
    },
    onRegisterError: () => {
      // Ignore service worker registration errors in restricted iframe environments
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
