import { getAndroidAccountSnapshot } from './androidAccount';
import { getReceiptJob, isReceiptJob, isReceiptJobTerminal, ReceiptAPIError, type ReceiptJob, type ReceiptJobState } from './androidReceiptClient';
import { kv } from './kv';
import { parsePendingReceipt, type PendingReceipt } from './receiptDraftFiles';

export type LocalReceiptResult = { id: string; savedAt: number; state: ReceiptJobState; documentCount: number; merchant?: string };
type StoredResult = { savedAt: number; job: ReceiptJob };
type Listener = () => void;
type JobRequest = { promise: Promise<ReceiptJob>; controller: AbortController; consumers: number };

const validID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const archiveListeners = new Map<string, Set<Listener>>();
const pendingListeners = new Map<string, Set<Listener>>();
const requests = new Map<string, JobRequest>();
const missingReceiptGraceMs = 120_000;
const settlementGraceMs = 15 * 60_000;

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

function ownsArchive(accountId: string) {
  return getAndroidAccountSnapshot().accountId === accountId;
}

export function readPendingReceipt(accountId: string): PendingReceipt | undefined {
  if (!ownsArchive(accountId)) return undefined;
  return parsePendingReceipt(kv.getItem(pendingKey(accountId)));
}

export function writePendingReceipt(accountId: string, pointer: PendingReceipt | undefined) {
  if (!ownsArchive(accountId)) return;
  kv.setItem(pendingKey(accountId), pointer ? JSON.stringify(pointer) : '');
  notify(pendingListeners, accountId);
}

export function reservePendingReceipt(accountId: string, pointer: PendingReceipt): boolean {
  if (!ownsArchive(accountId) || !validID.test(pointer.id) || !validTime(pointer.startedAt) || readPendingReceipt(accountId)) {
    return false;
  }
  writePendingReceipt(accountId, pointer);
  return true;
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

function merchantLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim();
  return label ? Array.from(label).slice(0, 100).join('') : undefined;
}

function firstMerchant(job: ReceiptJob) {
  for (const group of job.groups) {
    for (const document of group.result?.documents ?? []) {
      const label = merchantLabel(document.merchant);
      if (label) return label;
    }
  }
  return undefined;
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
  if (!ownsArchive(accountId)) return undefined;
  return readStoredResult(accountId, id)?.job;
}

export function listLocalReceiptResults(accountId: string): LocalReceiptResult[] {
  if (!ownsArchive(accountId)) return [];
  const value = parsed(indexKey(accountId));
  if (!Array.isArray(value)) return [];
  const results = value.filter((entry): entry is LocalReceiptResult => typeof entry?.id === 'string' &&
    validID.test(entry.id) && validTime(entry.savedAt) && isReceiptJobTerminal(entry.state) &&
    Number.isSafeInteger(entry.documentCount) && entry.documentCount > 0)
    .map(({ id, savedAt, state, documentCount, merchant }) => ({ id, savedAt, state, documentCount, merchant: merchantLabel(merchant) }));
  return results.sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id));
}

export function saveLocalReceiptResult(accountId: string, job: ReceiptJob): boolean {
  if (!ownsArchive(accountId) || !validID.test(job.id)) return false;
  const existing = readStoredResult(accountId, job.id);
  if (!existing && (!isReceiptJob(job, job.id) || !downloadable(job))) return false;
  const saved = existing ?? { savedAt: Date.now(), job };
  const index = listLocalReceiptResults(accountId);
  const indexed = index.some(entry => entry.id === saved.job.id);
  // Keep the pending pointer until the result body and its index entry are durable.
  if (!existing) kv.setItem(itemKey(accountId, saved.job.id), JSON.stringify(saved));
  if (!indexed || !existing) {
    const summary = {
      id: saved.job.id, savedAt: saved.savedAt, state: saved.job.state, documentCount: documentCount(saved.job),
      merchant: firstMerchant(saved.job),
    };
    kv.setItem(indexKey(accountId), JSON.stringify([summary, ...index.filter(entry => entry.id !== saved.job.id)]));
    notify(archiveListeners, accountId);
  }
  return true;
}

export function deleteLocalReceiptResult(accountId: string, id: string) {
  if (!ownsArchive(accountId) || !validID.test(id)) return;
  kv.setItem(itemKey(accountId, id), '');
  const index = listLocalReceiptResults(accountId);
  kv.setItem(indexKey(accountId), JSON.stringify(index.filter(entry => entry.id !== id)));
  notify(archiveListeners, accountId);
}

function requestJob(accountId: string, id: string, signal?: AbortSignal) {
  const key = itemKey(accountId, id);
  let active = requests.get(key);
  if (!active) {
    const controller = new AbortController();
    const promise = getReceiptJob(id, controller.signal, accountId).finally(() => {
      if (requests.get(key)?.controller === controller) requests.delete(key);
    });
    active = { promise, controller, consumers: 0 };
    requests.set(key, active);
  }
  const request = active;
  request.consumers += 1;
  return whileActive(request.promise, signal).finally(() => {
    request.consumers -= 1;
    if (request.consumers === 0 && requests.get(key) === request) {
      requests.delete(key);
      request.controller.abort();
    }
  });
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
  if (signal?.aborted || !ownsArchive(accountId)) return undefined;
  const pointer = readPendingReceipt(accountId);
  if (!pointer) return undefined;
  const job = readLocalReceiptResult(accountId, pointer.id) ?? await requestJob(accountId, pointer.id, signal);
  if (!job || signal?.aborted || !ownsArchive(accountId)) return undefined;
  const current = readPendingReceipt(accountId);
  if (current?.id !== pointer.id) return current ? undefined : readLocalReceiptResult(accountId, pointer.id);
  if (saveLocalReceiptResult(accountId, job)) writePendingReceipt(accountId, undefined);
  return job;
}

export function watchPendingReceiptResult(accountId: string, signal: AbortSignal) {
  if (signal.aborted) return () => {};
  const receiver = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let delay = 5_000;
  let stopped = false;
  let revision = 0;
  let consecutiveFailures = 0;
  let slowMode = false;

  function schedule(wait: number) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => void poll(), wait);
  }

  async function poll() {
    if (busy || stopped || !ownsArchive(accountId)) return;
    let pointer: PendingReceipt | undefined;
    let terminal = false;
    let read = false;
    const observedRevision = revision;
    busy = true;
    try {
      pointer = readPendingReceipt(accountId);
      read = true;
      if (!pointer) return;
      const job = await receivePendingReceiptResult(accountId, receiver.signal);
      consecutiveFailures = 0;
      if (job) slowMode = job.mode === 'background' || job.mode === 'batch';
      terminal = !!job && (isReceiptJobTerminal(job.state) ||
        (!!job.deadline && Date.now() - Date.parse(job.deadline) >= settlementGraceMs));
    } catch (error) {
      consecutiveFailures += 1;
      const unavailable = error instanceof ReceiptAPIError &&
        (error.status === 401 || error.status === 403 ||
          (error.status === 404 && !!pointer && Date.now() - pointer.startedAt >= missingReceiptGraceMs));
      // Keep the pointer available for explicit rechecks and a future foreground session.
      terminal = unavailable || consecutiveFailures >= 6;
    } finally {
      busy = false;
      if (!stopped) {
        if (revision !== observedRevision) schedule(0);
        else if (!terminal && (pointer || !read)) {
          const maxDelay = slowMode ? 5 * 60_000 : 60_000;
          if (slowMode) delay = Math.max(delay, 30_000);
          schedule(delay);
          delay = Math.min(delay * 2, maxDelay);
        }
      }
    }
  }

  const unsubscribe = subscribe(pendingListeners, accountId, () => {
    revision += 1;
    delay = 5_000;
    consecutiveFailures = 0;
    slowMode = false;
    schedule(0);
  });
  const stop = () => {
    stopped = true;
    receiver.abort();
    clearTimeout(timer);
    unsubscribe();
    signal.removeEventListener('abort', stop);
  };
  signal.addEventListener('abort', stop, { once: true });
  schedule(0);
  return stop;
}
