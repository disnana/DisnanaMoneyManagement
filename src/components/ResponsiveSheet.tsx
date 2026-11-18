import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  Variants,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { X } from 'lucide-react';

interface ResponsiveSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId?: string;
  maxWidthClass?: string;
  instantClose?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const scrimVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.14, ease: 'easeOut' },
  },
  exit: (skip: boolean) => ({
    opacity: 0,
    transition: { duration: skip ? 0 : 0.08, ease: 'easeOut' },
  }),
};

const sheetTransitionVariants: Variants = {
  initial: { y: 36, opacity: 0 },
  animate: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
  },
  exit: (skip: boolean) => ({
    y: skip ? 0 : 48,
    opacity: 0,
    transition: { duration: skip ? 0 : 0.11, ease: [0.32, 0.72, 0, 1] },
  }),
};

export const ResponsiveSheet: React.FC<ResponsiveSheetProps> = ({
  open,
  onClose,
  title,
  titleId,
  maxWidthClass = 'sm:max-w-lg',
  instantClose = false,
  footer,
  children,
}) => {
  const sheetY = useMotionValue(0);
  const backdropDragOpacity = useTransform(sheetY, [0, 320], [1, 0]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const isDismissingRef = useRef(false);
  const [dragDismissed, setDragDismissed] = useState(false);

  useEffect(() => {
    if (open) {
      isDismissingRef.current = false;
      setDragDismissed(false);
      sheetY.set(0);
    }
  }, [open, sheetY]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  const finishPull = useCallback(
    (dy: number, velocityY: number) => {
      if (isDismissingRef.current) return;
      if (dy > 90 || (dy > 32 && velocityY > 0.42)) {
        isDismissingRef.current = true;
        const target = typeof window !== 'undefined' ? window.innerHeight : 700;
        animate(sheetY, target, {
          duration: 0.14,
          ease: [0.32, 0.72, 0, 1],
          onComplete: () => {
            setDragDismissed(true);
            onClose();
          },
        });
      } else {
        animate(sheetY, 0, {
          type: 'spring',
          stiffness: 460,
          damping: 38,
        });
      }
    },
    [onClose, sheetY]
  );

  // Pull-down gesture on handle & header (mobile & touch)
  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.innerWidth >= 640) return;
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest('button')) return;

    const startY = e.clientY;
    const startTime = performance.now();
    let currentDy = 0;

    const handleMove = (ev: PointerEvent) => {
      const dy = Math.max(0, ev.clientY - startY);
      currentDy = dy;
      sheetY.set(dy);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      const dt = Math.max(16, performance.now() - startTime);
      finishPull(currentDy, currentDy / dt);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  // Pull-down gesture from inside scrollable body when scrolled to top (scrollTop <= 0)
  useEffect(() => {
    if (!open) return;
    const el = bodyRef.current;
    if (!el) return;

    let startY = 0;
    let startX = 0;
    let startTime = 0;
    let canPull = false;
    let pulling = false;
    let currentDy = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 640 || e.touches.length !== 1) {
        canPull = false;
        return;
      }
      if (el.scrollTop <= 1) {
        startY = e.touches[0].clientY;
        startX = e.touches[0].clientX;
        startTime = performance.now();
        canPull = true;
        pulling = false;
        currentDy = 0;
      } else {
        canPull = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!canPull || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;

      if (!pulling) {
        if (dy > 8 && dy > Math.abs(dx) * 1.2 && el.scrollTop <= 1) {
          pulling = true;
        } else if (dy < -4 || Math.abs(dx) > 12) {
          canPull = false;
          return;
        }
      }

      if (pulling) {
        if (e.cancelable) e.preventDefault();
        currentDy = Math.max(0, dy);
        sheetY.set(currentDy);
      }
    };

    const onTouchEnd = () => {
      if (pulling) {
        const dt = Math.max(16, performance.now() - startTime);
        finishPull(currentDy, currentDy / dt);
      }
      canPull = false;
      pulling = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [open, finishPull, sheetY]);

  const skipExit = instantClose || dragDismissed;

  const sheetTree = (
    <AnimatePresence custom={skipExit}>
      {open && (
        <div
          key="responsive-sheet-root"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          {/* Scrim layer: fades out faster than the sheet and clears to 0 during drag */}
          <motion.div
            aria-hidden="true"
            variants={scrimVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            custom={skipExit}
            onClick={onClose}
            className="absolute inset-0"
          >
            <motion.div
              style={{ opacity: backdropDragOpacity }}
              className="h-full w-full bg-slate-900/35"
            />
          </motion.div>

          {/* Enter/Exit transition wrapper (opaque sheet card never alpha-blends with scrim) */}
          <motion.div
            variants={sheetTransitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            custom={skipExit}
            className={`relative z-10 w-full ${maxWidthClass}`}
          >
            {/* Interactive pull-down layer */}
            <motion.div
              style={{ y: sheetY }}
              className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
            >
              {/* Pull-to-dismiss handle + sticky header zone */}
              <div
                ref={headerRef}
                onPointerDown={handleHeaderPointerDown}
                className="shrink-0 touch-none select-none sm:touch-auto"
              >
                {/* Mobile Drag Handle Indicator */}
                <div className="flex justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
                  <span className="h-1.5 w-11 rounded-full bg-slate-300" />
                </div>

                {/* Sticky Sheet Header */}
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:px-6 sm:py-4">
                  <h2
                    id={titleId}
                    className="text-base font-semibold leading-snug text-slate-900"
                  >
                    {title}
                  </h2>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 active:scale-95"
                    aria-label="閉じる"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable Body */}
              <div
                ref={bodyRef}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5"
              >
                {children}
              </div>

              {/* Optional Sticky Footer */}
              {footer && (
                <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3.5 pb-safe sm:px-6 sm:py-4">
                  {footer}
                </div>
              )}
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(sheetTree, document.body);
};
