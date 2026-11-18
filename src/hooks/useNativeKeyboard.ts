import { useEffect } from 'react';

/**
 * Make every text field behave well with the OS soft keyboard (touch devices only):
 *  - numeric fields get the digit pad (inputmode), others don't autocapitalize/autocorrect/autofill
 *    (this also removes iOS's contact/password suggestion strip)
 *  - the keyboard's return key is labelled correctly (次へ / 完了 / 検索) and moves focus
 *    instead of submitting half-filled forms; IME composition (Japanese) is never interrupted
 *  - the focused field is scrolled into view above the keyboard
 * Desktop keeps normal behaviour (Enter submits).
 */
const SKIP_TYPES = new Set([
  'checkbox',
  'radio',
  'range',
  'file',
  'date',
  'month',
  'time',
  'datetime-local',
  'button',
  'submit',
  'reset',
  'hidden',
  'color',
]);

export function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !SKIP_TYPES.has(el.type);
}

export function getFieldOrder(from: HTMLElement): HTMLElement[] {
  const scope =
    (from.closest('form') as HTMLElement | null) ??
    (from.closest('[role="dialog"]') as HTMLElement | null) ??
    document.body;
  return Array.from(scope.querySelectorAll<HTMLElement>('input, textarea')).filter(
    (el) =>
      isTextField(el) &&
      !(el as HTMLInputElement).disabled &&
      !(el as HTMLInputElement).readOnly &&
      el.offsetParent !== null
  );
}

export function useNativeKeyboard(): void {
  useEffect(() => {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (!coarse) return;

    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!isTextField(el)) return;

      if (el instanceof HTMLInputElement && el.type === 'number' && !el.hasAttribute('inputmode')) {
        const step = el.getAttribute('step');
        el.setAttribute('inputmode', step && step !== '1' && step !== 'any' ? 'decimal' : 'numeric');
      }
      if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
      if (!el.hasAttribute('autocapitalize')) el.setAttribute('autocapitalize', 'off');
      if (!el.hasAttribute('spellcheck')) el.setAttribute('spellcheck', 'false');
      const numeric = el.getAttribute('inputmode') === 'numeric' || el.getAttribute('inputmode') === 'decimal' || (el as HTMLInputElement).type === 'number';
      if (numeric && !el.hasAttribute('autocorrect')) el.setAttribute('autocorrect', 'off');

      if (!el.hasAttribute('enterkeyhint') && !(el instanceof HTMLTextAreaElement)) {
        if ((el as HTMLInputElement).type === 'search') {
          el.setAttribute('enterkeyhint', 'search');
        } else {
          const order = getFieldOrder(el);
          const last = order[order.length - 1] === el;
          el.setAttribute('enterkeyhint', last ? 'done' : 'next');
        }
      }

      // Keep the field visible above the keyboard
      window.setTimeout(() => {
        if (document.activeElement === el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 320);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      const el = e.target as HTMLElement | null;
      if (!(el instanceof HTMLInputElement) || !isTextField(el)) return;
      const hint = el.getAttribute('enterkeyhint');
      if (hint === 'search') {
        el.blur();
        return;
      }
      if (hint !== 'next' && hint !== 'done') return;
      e.preventDefault();
      const order = getFieldOrder(el);
      const i = order.indexOf(el);
      if (hint === 'next' && i >= 0 && i < order.length - 1) order[i + 1].focus();
      else el.blur();
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}
