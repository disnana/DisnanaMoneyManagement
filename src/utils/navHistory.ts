/**
 * Back-button / back-gesture support for PWAs (Android hardware back, desktop).
 * Overlays (sheets, dialogs) register a "layer"; the system back action closes the
 * top-most layer instead of leaving the app. Tabs use a single extra entry so that
 * back from any non-home tab returns to Home before exiting.
 */
type Layer = { id: number; close: () => void };

const layers: Layer[] = [];
let seq = 0;
let suppress = 0;
let tabEntryActive = false;
let tabFallback: (() => void) | null = null;
let installed = false;

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('popstate', () => {
    if (suppress > 0) {
      suppress--;
      return;
    }
    const top = layers.pop();
    if (top) {
      top.close();
      return;
    }
    if (tabEntryActive) {
      tabEntryActive = false;
      tabFallback?.();
    }
  });
}

/** Register an overlay. Returns a release function to call when it closes programmatically. */
export function pushLayer(close: () => void): () => void {
  install();
  const id = ++seq;
  layers.push({ id, close });
  try {
    history.pushState({ dmm: id }, '');
  } catch {
    // ignore
  }
  return () => {
    const i = layers.findIndex((l) => l.id === id);
    if (i === -1) return; // already closed via back
    layers.splice(i, 1);
    suppress++;
    try {
      history.back();
    } catch {
      suppress--;
    }
  };
}

export function setTabBackHandler(fn: () => void) {
  install();
  tabFallback = fn;
}

/** Call when leaving Home for another tab. */
export function enterTab() {
  install();
  if (tabEntryActive) return;
  tabEntryActive = true;
  try {
    history.pushState({ dmmTab: true }, '');
  } catch {
    tabEntryActive = false;
  }
}

/** Call when returning to Home by tapping (not via back). */
export function leaveTabs() {
  if (!tabEntryActive) return;
  tabEntryActive = false;
  suppress++;
  try {
    history.back();
  } catch {
    suppress--;
  }
}
