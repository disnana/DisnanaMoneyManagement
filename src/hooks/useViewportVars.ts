import { useEffect } from 'react';

/**
 * Publishes the *visual* viewport as CSS variables so fixed UI can stay above the
 * on-screen keyboard on iOS (where the layout viewport does not shrink) and Android.
 *  --vvh : visual viewport height, --vvt : visual viewport offset top
 *  html[data-kb="open"] when the soft keyboard is (very likely) visible
 */
export function useViewportVars(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    let raf = 0;
    let baseHeight = window.innerHeight;

    const apply = () => {
      raf = 0;
      const h = vv ? vv.height : window.innerHeight;
      const top = vv ? vv.offsetTop : 0;
      root.style.setProperty('--vvh', `${Math.round(h)}px`);
      root.style.setProperty('--vvt', `${Math.round(top)}px`);
      baseHeight = Math.max(baseHeight, window.innerHeight);
      const kb = baseHeight - h > 140;
      if (kb) root.setAttribute('data-kb', 'open');
      else root.removeAttribute('data-kb');
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onOrientation = () => {
      baseHeight = window.innerHeight;
      schedule();
    };

    apply();
    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);
    window.addEventListener('orientationchange', onOrientation);
    return () => {
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
      window.removeEventListener('orientationchange', onOrientation);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}
