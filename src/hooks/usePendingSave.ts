import { useLayoutEffect, useRef, useState } from 'react';

/** Ignore repeated submissions and completions belonging to an editor that has since closed. */
export function usePendingSave(draft: unknown) {
  const request = useRef<object | null>(null);
  const [pending, setPending] = useState(false);

  useLayoutEffect(() => {
    setPending(false);
    return () => { request.current = null; };
  }, [draft]);

  const submit = async (write: (isCurrent: () => boolean) => Promise<boolean>) => {
    if (request.current) return;
    const token = {};
    request.current = token;
    setPending(true);
    try {
      const isCurrent = () => request.current === token;
      const saved = await write(isCurrent);
      return isCurrent() ? saved : undefined;
    } finally {
      if (request.current === token) {
        request.current = null;
        setPending(false);
      }
    }
  };

  return { pending, submit };
}
