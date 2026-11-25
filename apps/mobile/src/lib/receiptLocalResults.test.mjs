import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  getJob: vi.fn(),
  account: 'account-a',
}));
vi.mock('./kv', () => ({ kv: { getItem: mocks.read, setItem: mocks.write } }));
vi.mock('./androidAccount', () => ({ getAndroidAccountSnapshot: () => ({ accountId: mocks.account }) }));
vi.mock('expo-file-system', () => ({}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('./androidProof', () => ({}));
vi.mock('./androidReceiptClient', async (importOriginal) => ({ ...(await importOriginal()), getReceiptJob: mocks.getJob }));

import {
  deleteLocalReceiptResult, listLocalReceiptResults, readLocalReceiptResult, readPendingReceipt, receivePendingReceiptResult,
  reservePendingReceipt, saveLocalReceiptResult, subscribeLocalReceiptResults, watchPendingReceiptResult, writePendingReceipt,
} from './receiptLocalResults';
import { ReceiptAPIError } from './androidReceiptClient';

const accountA = 'account-a';
const accountB = 'account-b';
const storage = new Map();

function completed(id) {
  return {
    id, state: 'COMPLETED', accepted: true, settled: true, price_version: 'staging-1', maximum_credit: 1, final_credit: 1,
    deadline: '2026-11-24T10:00:00Z', result_expires_at: '2026-11-24T11:00:00.123456789Z', result_expired: false,
    groups: [{ id: 'document-1', state: 'COMPLETED', result: {
      documents: [{ source_image_ids: ['page-1'], document_type: 'itemized_receipt', status: 'success', quality_reason: null,
        merchant: 'Test shop', date: '2026-11-24', currency: 'JPY', total_minor: 120, subtotal_minor: null,
        discount_minor: null, tax_minor: null, items: [], payments: [] }],
    } }],
  };
}

beforeEach(() => {
  storage.clear();
  mocks.read.mockReset().mockImplementation(key => storage.get(key) ?? null);
  mocks.write.mockReset().mockImplementation((key, value) => storage.set(key, value));
  mocks.getJob.mockReset();
  mocks.account = accountA;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('local Android receipt results', () => {
  it('lists newest results per account, preserves downloaded documents after server expiry, and deletes a selected copy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T10:00:00Z'));
    const original = completed('job-1');
    const updated = vi.fn();
    const unsubscribe = subscribeLocalReceiptResults(accountA, updated);
    expect(saveLocalReceiptResult(accountA, original)).toBe(true);
    vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
    expect(saveLocalReceiptResult(accountA, completed('job-2'))).toBe(true);
    expect(saveLocalReceiptResult(accountB, completed('job-3'))).toBe(false);
    expect(saveLocalReceiptResult(accountA, { ...original, result_expired: true, groups: [] })).toBe(true);
    expect(readLocalReceiptResult(accountA, 'job-1')).toEqual(original);
    expect(readLocalReceiptResult(accountB, 'job-1')).toBeUndefined();
    expect(listLocalReceiptResults(accountA).map(job => job.id)).toEqual(['job-2', 'job-1']);
    mocks.account = accountB;
    expect(listLocalReceiptResults(accountA)).toEqual([]);
    expect(saveLocalReceiptResult(accountB, completed('job-3'))).toBe(true);
    expect(listLocalReceiptResults(accountB).map(job => job.id)).toEqual(['job-3']);
    mocks.account = accountA;
    deleteLocalReceiptResult(accountA, 'job-1');
    expect(readLocalReceiptResult(accountA, 'job-1')).toBeUndefined();
    expect(listLocalReceiptResults(accountA).map(job => job.id)).toEqual(['job-2']);
    expect(updated).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it('keeps a pending upload on HTTP 404 and on failed persistence, and repairs an interrupted archive write', async () => {
    const pointer = { id: 'job-1', startedAt: 1_000 };
    const result = completed(pointer.id);
    writePendingReceipt(accountA, pointer);
    mocks.getJob.mockRejectedValueOnce(Object.assign(new Error(), { status: 404 }));
    await expect(receivePendingReceiptResult(accountA)).rejects.toMatchObject({ status: 404 });
    expect(readPendingReceipt(accountA)).toEqual(pointer);

    mocks.getJob.mockResolvedValueOnce(result);
    mocks.write.mockImplementationOnce((key, value) => storage.set(key, value))
      .mockImplementationOnce(() => { throw new Error('storage full'); });
    await expect(receivePendingReceiptResult(accountA)).rejects.toThrow('storage full');
    expect(readPendingReceipt(accountA)).toEqual(pointer);
    expect(listLocalReceiptResults(accountA)).toEqual([]);
    await expect(receivePendingReceiptResult(accountA)).resolves.toEqual(result);
    expect(mocks.getJob).toHaveBeenCalledTimes(2);
    expect(readPendingReceipt(accountA)).toBeUndefined();
    expect(listLocalReceiptResults(accountA)).toHaveLength(1);
  });

  it('coalesces simultaneous reads and allows one caller to stop without losing the archived result', async () => {
    const result = completed('job-1');
    const controller = new AbortController();
    let resolveJob;
    mocks.getJob.mockImplementationOnce(() => new Promise(resolve => { resolveJob = resolve; }));
    writePendingReceipt(accountA, { id: result.id, startedAt: 1_000 });
    const background = receivePendingReceiptResult(accountA, controller.signal);
    const screen = receivePendingReceiptResult(accountA);
    controller.abort();
    await expect(background).resolves.toBeUndefined();
    expect(mocks.getJob).toHaveBeenCalledTimes(1);
    resolveJob(result);
    await expect(screen).resolves.toEqual(result);
    expect(readLocalReceiptResult(accountA, result.id)).toEqual(result);
  });

  it('wakes after the app receives a new pending pointer and saves only for the verified account', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = completed('job-1');
    mocks.getJob.mockResolvedValue(result);
    watchPendingReceiptResult(accountA, controller.signal);
    await vi.advanceTimersByTimeAsync(20);
    expect(mocks.getJob).not.toHaveBeenCalled();
    writePendingReceipt(accountA, { id: result.id, startedAt: 1_000 });
    await vi.advanceTimersByTimeAsync(20);
    expect(readLocalReceiptResult(accountA, result.id)).toEqual(result);
    expect(readPendingReceipt(accountA)).toBeUndefined();
    controller.abort();
    writePendingReceipt(accountA, { id: 'job-2', startedAt: 2_000 });
    mocks.account = accountB;
    await expect(receivePendingReceiptResult(accountA)).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.getJob).toHaveBeenCalledTimes(1);
  });

  it('ignores damaged manifests and result bodies', () => {
    mocks.read.mockReturnValue('broken JSON');
    expect(listLocalReceiptResults(accountA)).toEqual([]);
    expect(readLocalReceiptResult(accountA, 'job-1')).toBeUndefined();
    expect(readPendingReceipt(accountA)).toBeUndefined();
  });

  it('indexes the first non-empty receipt merchant without requiring it on old results', () => {
    const old = [{ id: 'job-old', savedAt: 1_000, state: 'COMPLETED', documentCount: 1 }];
    writePendingReceipt(accountA, undefined);
    storage.set('dmm.receipt.archive.v1.9.account-a.index', JSON.stringify(old));
    const first = completed('job-1');
    const original = first.groups[0].result.documents[0];
    first.groups[0].result.documents = [{ ...original, merchant: ' ' }, { ...original, merchant: `  ${'店'.repeat(150)}  ` }];
    expect(saveLocalReceiptResult(accountA, first)).toBe(true);
    expect(listLocalReceiptResults(accountA)).toEqual([
      { id: 'job-1', savedAt: expect.any(Number), state: 'COMPLETED', documentCount: 2, merchant: '店'.repeat(100) },
      { ...old[0], merchant: undefined },
    ]);
  });

  it('allows only one upload reservation and hides receipts after switching accounts', async () => {
    const first = { id: 'job-1', startedAt: 1_000 };
    const second = { id: 'job-2', startedAt: 2_000 };
    let resolveJob;
    mocks.getJob.mockImplementationOnce(() => new Promise(resolve => { resolveJob = resolve; }));
    expect(reservePendingReceipt(accountA, first)).toBe(true);
    expect(reservePendingReceipt(accountA, second)).toBe(false);
    expect(reservePendingReceipt(accountB, second)).toBe(false);
    const receive = receivePendingReceiptResult(accountA);
    mocks.account = accountB;
    resolveJob(completed(first.id));
    await expect(receive).resolves.toBeUndefined();
    expect(readPendingReceipt(accountA)).toBeUndefined();
    expect(listLocalReceiptResults(accountA)).toEqual([]);
    mocks.account = accountA;
    expect(readPendingReceipt(accountA)).toEqual(first);
    expect(readLocalReceiptResult(accountA, first.id)).toBeUndefined();
  });

  it('cancels the shared request once every foreground caller leaves', async () => {
    const controller = new AbortController();
    const pointer = { id: 'job-1', startedAt: 1_000 };
    writePendingReceipt(accountA, pointer);
    let networkSignal;
    mocks.getJob.mockImplementationOnce((_, signal) => {
      networkSignal = signal;
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    });
    const pending = receivePendingReceiptResult(accountA, controller.signal);
    controller.abort();
    await expect(pending).resolves.toBeUndefined();
    expect(networkSignal.aborted).toBe(true);
    expect(readPendingReceipt(accountA)).toEqual(pointer);
  });

  it('backs off batch polling and stops absent status polling without clearing the pointer', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pointer = { id: 'job-1', startedAt: Date.now() };
    writePendingReceipt(accountA, pointer);
    mocks.getJob.mockResolvedValue({ id: pointer.id, mode: 'batch', state: 'PROCESSING', settled: false });
    watchPendingReceiptResult(accountA, controller.signal);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(mocks.getJob).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(mocks.getJob).toHaveBeenCalledTimes(2);
    mocks.getJob.mockRejectedValue(new ReceiptAPIError(404, 'receipt_not_found'));
    await vi.advanceTimersByTimeAsync(600_000);
    expect(mocks.getJob).toHaveBeenCalledTimes(4);
    expect(readPendingReceipt(accountA)).toEqual(pointer);
    controller.abort();
  });
});
