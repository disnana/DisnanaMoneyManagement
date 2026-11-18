import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getFieldOrder, isTextField } from '../hooks/useNativeKeyboard';
import { haptic } from '../utils/haptics';

/**
 * iOS-style accessory bar pinned to the top edge of the soft keyboard: ˄ ˅ 前/次の項目, 完了.
 * Needed because iOS's numeric keypad has no return/done key. Touch devices only.
 */
export const KeyboardAccessory: React.FC = () => {
  const [active, setActive] = useState<HTMLElement | null>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const coarse =
    typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);

  useEffect(() => {
    if (!coarse) return;
    const sync = () => {
      const el = document.activeElement;
      setActive(isTextField(el) ? el : null);
      setKbOpen(document.documentElement.getAttribute('data-kb') === 'open');
    };
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', () => window.setTimeout(sync, 0));
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-kb'] });
    return () => {
      document.removeEventListener('focusin', sync);
      mo.disconnect();
    };
  }, [coarse]);

  if (!coarse || !active || !kbOpen) return null;

  const order = getFieldOrder(active);
  const i = order.indexOf(active);
  const go = (d: number) => {
    haptic(5);
    order[i + d]?.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label="入力補助"
      className="glass-bar fixed inset-x-0 z-[70] flex h-11 items-center justify-between border-t border-slate-200/80 px-2"
      style={{ top: 'calc(var(--vvt, 0px) + var(--vvh, 100%) - 44px)' }}
      // keep focus in the field while tapping the bar
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="flex items-center">
        <button
          type="button"
          aria-label="前の項目"
          disabled={i <= 0}
          onClick={() => go(-1)}
          className="flex h-11 w-11 items-center justify-center text-teal-700 disabled:text-slate-300 active:opacity-50"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="次の項目"
          disabled={i < 0 || i >= order.length - 1}
          onClick={() => go(1)}
          className="flex h-11 w-11 items-center justify-center text-teal-700 disabled:text-slate-300 active:opacity-50"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          haptic(5);
          active.blur();
        }}
        className="h-11 px-4 text-[17px] font-semibold text-teal-700 active:opacity-50"
      >
        完了
      </button>
    </div>
  );
};
