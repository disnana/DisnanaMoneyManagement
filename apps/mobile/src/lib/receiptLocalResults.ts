import { getAndroidAccountSnapshot } from './androidAccount';
import { getReceiptJob, isReceiptJob, isReceiptJobTerminal, type ReceiptJob, type ReceiptJobState } from './androidReceiptClient';
import { kv } from './kv';
import { parsePendingReceipt, type PendingReceipt } from './receiptDraftFiles';

export type LocalReceiptResult = { id: string; savedAt: number; state: ReceiptJobState; documentCount: number };
type StoredResult = { savedAt: number; job: ReceiptJob };
type Listener = () => void;

const validID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const archiveListeners = new Map<string, Set<Listener>>();
const pendingListeners = new Map<string, Set<Listener>>();
const requests = new Map<string, Promise<ReceiptJob>>();

const pendingKey = (accountId: string) => `dmm.receipt.job.v1.${accountId}`;
const archiveKey = (accountId: string) => `dmm.receipt.archive.v1.${accountId.length}.${accountId}`;
const indexKey = (accountId: string) => `${archiveKey(accountId)}.index`;
const itemKey = (accountId: string, id: string) => `${archiveKey(accountId)}.job.${id}`;

function subscribe(listeners: Map<string, Set<Listener>>, accountId: string, listener: Listener) {
  const account = listeners.get(accountId) ?? new Set<Listener>();
  listeners.set(accountId, account);
  account.add(listener);
  return () => {
    account.delete(listener);
    if (account.size === 0) listeners.delete(accountId);
  };
}

function notify(listeners: Map<string, Set<Listener>>, accountId: string) {
  for (const listener of listeners.get(accountId) ?? []) listener();
}

export function subscribeLocalReceiptResults(accountId: string, listener: Listener) {
  return subscribe(archiveListeners, accountId, listener);
}

export function readPendingReceipt(accountId: string): PendingReceipt | undefined {
  return parsePendingReceipt(kv.getItem(pendingKey(accountId)));
}

export function writePendingReceipt(accountId: string, pointer: PendingReceipt | undefined) {
  kv.setItem(pendingKey(accountId), pointer ? JSON.stringify(pointer) : '');
  notify(pendingListeners, accountId);
}

function parsed(key: string): unknown {
  const value = kv.getItem(key);
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 8.64e15;
}

function documentCount(job: ReceiptJob) {
  return job.groups.reduce((sum, group) => sum + (group.result?.documents.length ?? 0), 0);
}

function downloadable(job: ReceiptJob) {
  return job.settled && isReceiptJobTerminal(job.state) && !job.result_expired && documentCount(job) > 0;
}

function readStoredResult(accountId: string, id: string): StoredResult | undefined {
  if (!validID.test(id)) return undefined;
  const value = parsed(itemKey(accountId, id)) as Partial<StoredResult> | null;
  if (!validTime(value?.savedAt) || !isReceiptJob(value.job, id) || !downloadable(value.job)) return undefined;
  return { savedAt: value.savedAt, job: value.job };
}

export function readLocalReceiptResult(accountId: string, id: string): ReceiptJob | undefined {
  return readStoredResult(accountId, id)?.job;
}

export function listLocalReceiptResults(accountId: string): LocalReceiptResult[] {
  const value = parsed(indexKey(accountId));
  if (!Array.isArray(value)) return [];
  const results = value.filter((entry): entry is LocalReceiptResult => typeof entry?.id === 'string' &&
    validID.test(entry.id) && validTime(entry.savedAt) && isReceiptJobTerminal(entry.state) &&
    Number.isSafeInteger(entry.documentCount) && entry.documentCount > 0);
  return results.sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id));
}

export function saveLocalReceiptResult(accountId: string, job: ReceiptJob): boolean {
  if (!validID.test(job.id)) return false;
  const existing = readStoredResult(accountId, job.id);
  if (!existing && (!isReceiptJob(job, job.id) || !downloadable(job))) return false;
  const saved = existing ?? { savedAt: Date.now(), job };
  const index = listLocalReceiptResults(accountId);
  const indexed = index.some(entry => entry.id === saved.job.id);
  // Keep the pending pointer until the result body and its index entry are durable.
  if (!existing) kv.setItem(itemKey(accountId, saved.job.id), JSON.stringify(saved));
  if (!indexed || !existing) {
    const summary = { id: saved.job.id, savedAt: saved.savedAt, state: saved.job.state, documentCount: documentCount(saved.job) };
    kv.setItem(indexKey(accountId), JSON.stringify([summary, ...index.filter(entry => entry.id !== saved.job.id)]));
    notify(archiveListeners, accountId);
  }
  return true;
}

export function deleteLocalReceiptResult(accountId: string, id: string) {
  if (!validID.test(id)) return;
  kv.setItem(itemKey(accountId, id), '');
  const index = listLocalReceiptResults(accountId);
  kv.setItem(indexKey(accountId), JSON.stringify(index.filter(entry => entry.id !== id)));
  notify(archiveListeners, accountId);
}

function requestJob(accountId: string, id: string) {
  const key = itemKey(accountId, id);
  const active = requests.get(key);
  if (active) return active;
  const request = getReceiptJob(id).finally(() => requests.delete(key));
  requests.set(key, request);
  return request;
}

function whileActive(request: Promise<ReceiptJob>, signal?: AbortSignal) {
  if (!signal) return request;
  return new Promise<ReceiptJob | undefined>((resolve, reject) => {
    const cancel = () => resolve(undefined);
    signal.addEventListener('abort', cancel, { once: true });
    request.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
    if (signal.aborted) cancel();
  });
}

export async function receivePendingReceiptResult(accountId: string, signal?: AbortSignal) {
  if (signal?.aborted || getAndroidAccountSnapshot().accountId !== accountId) return undefined;
  const pointer = readPendingReceipt(accountId);
  if (!pointer) return undefined;
  const job = readLocalReceiptResult(accountId, pointer.id) ?? await whileActive(requestJob(accountId, pointer.id), signal);
  if (!job || signal?.aborted || getAndroidAccountSnapshot().accountId !== accountId) return undefined;
  if (readPendingReceipt(accountId)?.id === pointer.id && saveLocalReceiptResult(accountId, job)) {
    writePendingReceipt(accountId, undefined);
  }
  return job;
}

export function watchPendingReceiptResult(accountId: string, signal: AbortSignal) {
  if (signal.aborted) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let delay = 5_000;
  let stopped = false;
  let revision = 0;

  function schedule(wait: number) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => void poll(), wait);
  }

  async function poll() {
    if (busy || stopped) return;
    let pointer: PendingReceipt | undefined;
    let terminal = false;
    let read = false;
    const observedRevision = revision;
    busy = true;
    try {
      pointer = readPendingReceipt(accountId);
      read = true;
      if (!pointer) return;
      const job = await receivePendingReceiptResult(accountId, signal);
      terminal = !!job && isReceiptJobTerminal(job.state);
    } catch {
      // Retry foreground reads without dropping a pending upload or reporting receipt content.
    } finally {
      busy = false;
      if (!stopped) {
        if (revision !== observedRevision) schedule(0);
        else if (!terminal && (pointer || !read)) {
          schedule(delay);
          delay = Math.min(delay * 2, 60_000);
        }
      }
    }
  }

  const unsubscribe = subscribe(pendingListeners, accountId, () => {
    revision += 1;
    delay = 5_000;
    schedule(0);
  });
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    signal.removeEventListener('abort', stop);
  };
  signal.addEventListener('abort', stop, { once: true });
  schedule(0);
  return stop;
}
