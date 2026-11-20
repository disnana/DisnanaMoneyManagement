import { useCallback, useRef } from 'react';
import { router, useFocusEffect, type Href } from 'expo-router';

type Result = boolean | string | null;
type AfterSave = 'leave' | 'stay';

/** A form owns one write at a time. Only the visit that submitted it may navigate on success. */
export function useFinanceSubmit(afterSave: AfterSave = 'leave') {
  const visit = useRef<{ pending: boolean } | null>(null);
  useFocusEffect(useCallback(() => {
    visit.current = { pending: false };
    return () => { visit.current = null; };
  }, []));

  return useCallback(async (write: () => Promise<Result>, behavior = afterSave): Promise<boolean> => {
    const submitting = visit.current;
    if (!submitting || submitting.pending) return false;
    submitting.pending = true;
    let saved = false;
    try {
      saved = Boolean(await write());
      return saved && visit.current === submitting;
    } finally {
      if (!saved || behavior === 'stay') submitting.pending = false;
    }
  }, [afterSave]);
}

/** Editors opened through a deep link can have no previous screen on the stack. */
export function closeEditor(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
