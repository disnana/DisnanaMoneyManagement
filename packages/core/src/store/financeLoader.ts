import type { FinanceState } from '../types/finance';
import type { FinanceStorage, ReactHooks } from './finance';

export async function openFinanceState(storage: FinanceStorage, initial: () => FinanceState): Promise<FinanceState> {
  const saved = await storage.loadState();
  if (saved !== null) return saved;
  const first = initial();
  try {
    await storage.saveState(first);
  } catch (error) {
    // Two newly opened tabs can both see an empty database. The winner owns the initial snapshot.
    if (error instanceof Error && error.name === 'FinanceConflictError') {
      const winner = await storage.loadState();
      if (winner !== null) return winner;
    }
    throw error;
  }
  return first;
}

type LoadResult =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; state: FinanceState };

/** The editor is mounted only after a successful read, or a user-confirmed restore. */
export function createFinanceLoader(react: ReactHooks, storage: FinanceStorage, initial: () => FinanceState) {
  let pending: Promise<FinanceState> | undefined;
  return function useFinanceLoader() {
    const [result, setResult] = react.useState<LoadResult>({ status: 'loading' });
    const [attempt, setAttempt] = react.useState(0);
    react.useEffect(() => {
      let active = true;
      pending ??= openFinanceState(storage, initial).finally(() => { pending = undefined; });
      pending.then(
        (state) => { if (active) setResult({ status: 'ready', state }); },
        () => { if (active) setResult({ status: 'error' }); },
      );
      return () => { active = false; };
    }, [attempt]);

    const retry = () => {
      setResult({ status: 'loading' });
      setAttempt((previous) => previous + 1);
    };
    const restore = async (validated: FinanceState) => {
      await storage.replaceState(validated);
      setResult({ status: 'ready', state: validated });
    };
    return { result, retry, restore };
  };
}
