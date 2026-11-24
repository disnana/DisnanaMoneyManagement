import { requestAndroidReceipt } from './androidAccount';
import { DeviceProofHTTPError, IssuerUnavailable, type ReceiptJobPath, type ReceiptOperation } from './androidProof';

export type ReceiptConfig = {
  price_version: string;
  credits_per_image: number;
  max_groups: number;
  max_images_per_group: number;
  max_total_images: number;
  max_image_bytes: number;
  max_total_image_bytes: number;
  max_image_pixels: number;
  max_json_bytes: number;
  result_retention_seconds?: number;
};

export type ReceiptJobInput = {
  maximum_credit: number;
  price_version: string;
  request: {
    groups: { id: string; images: { id: string; mime_type: string; data: string }[] }[];
  };
};

export type ReceiptJobState =
  | 'QUEUED' | 'CLAIMED' | 'SUBMITTING' | 'SUBMISSION_UNKNOWN' | 'PROCESSING' | 'SETTLING'
  | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export type ReceiptDocument = {
  source_image_ids: string[];
  document_type: string;
  status: 'success' | 'partial' | 'out_of_scope' | 'unreadable';
  quality_reason: 'blur' | 'glare' | null;
  merchant: string | null;
  date: string | null;
  currency: string | null;
  subtotal_minor: number | null;
  discount_minor: number | null;
  tax_minor: number | null;
  total_minor: number | null;
  items: { name: string | null; amount_minor: number | null }[];
  payments: {
    method: string | null;
    brand: string | null;
    issuer: string | null;
    last_four: string | null;
    payment_label: string | null;
    amount_minor: number | null;
  }[];
};

export type ReceiptJob = {
  id: string;
  state: ReceiptJobState;
  accepted: boolean;
  settled: boolean;
  price_version: string;
  maximum_credit: number;
  final_credit: number | null;
  deadline?: string;
  result_expires_at?: string | null;
  result_expired?: boolean;
  groups: {
    id: string;
    state: ReceiptJobState;
    result?: { documents: ReceiptDocument[] };
    error_code?: string;
  }[];
};

export class ReceiptAPIError extends Error {
  constructor(readonly status: number | null, readonly code: string, readonly mayHaveCommitted = false) {
    super(code);
    this.name = 'ReceiptAPIError';
  }
}

const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const terminalStates = new Set<ReceiptJobState>(['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'EXPIRED']);
const openStates = new Set<ReceiptJobState>([
  'QUEUED', 'CLAIMED', 'SUBMITTING', 'SUBMISSION_UNKNOWN', 'PROCESSING', 'SETTLING',
]);
const documentStates = new Set(['success', 'partial', 'out_of_scope', 'unreadable']);

export function isReceiptJobTerminal(state: ReceiptJobState) {
  return terminalStates.has(state);
}

function isJobState(value: unknown): value is ReceiptJobState {
  const state = value as ReceiptJobState;
  return terminalStates.has(state) || openStates.has(state);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown, minimum: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isReceiptConfig(value: unknown): value is ReceiptConfig {
  if (!object(value) || typeof value.price_version !== 'string' || !identifier.test(value.price_version)) return false;
  if (value.result_retention_seconds !== undefined && !integer(value.result_retention_seconds, 1)) return false;
  return ['credits_per_image', 'max_groups', 'max_images_per_group', 'max_total_images', 'max_image_bytes',
    'max_total_image_bytes', 'max_image_pixels', 'max_json_bytes'].every(key => integer(value[key], 1));
}

function optionalStrings(value: Record<string, unknown>, fields: string[]) {
  return fields.every(key => value[key] === null || typeof value[key] === 'string');
}

function money(value: unknown) {
  return value === null || typeof value === 'number' && Number.isSafeInteger(value);
}

function timestamp(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function isReceiptDocument(value: unknown): value is ReceiptDocument {
  return object(value) && typeof value.document_type === 'string' &&
    typeof value.status === 'string' && documentStates.has(value.status) &&
    (value.quality_reason === null || value.quality_reason === 'blur' || value.quality_reason === 'glare') &&
    Array.isArray(value.source_image_ids) && value.source_image_ids.every(id => typeof id === 'string') &&
    optionalStrings(value, ['merchant', 'date', 'currency']) &&
    ['subtotal_minor', 'discount_minor', 'tax_minor', 'total_minor'].every(key => money(value[key])) &&
    Array.isArray(value.items) && value.items.every(item =>
      object(item) && optionalStrings(item, ['name']) && money(item.amount_minor)) &&
    Array.isArray(value.payments) && value.payments.every(payment =>
      object(payment) && optionalStrings(payment, ['method', 'brand', 'issuer', 'last_four', 'payment_label']) && money(payment.amount_minor));
}

export function isReceiptJob(value: unknown, id: string): value is ReceiptJob {
  return object(value) && value.id === id && isJobState(value.state) &&
    typeof value.accepted === 'boolean' && typeof value.settled === 'boolean' &&
    typeof value.price_version === 'string' && identifier.test(value.price_version) && integer(value.maximum_credit, 0) &&
    (value.deadline === undefined || timestamp(value.deadline)) &&
    (value.result_expires_at === undefined || value.result_expires_at === null || timestamp(value.result_expires_at)) &&
    (value.result_expired === undefined || typeof value.result_expired === 'boolean') &&
    (value.final_credit === null || integer(value.final_credit, 0)) && Array.isArray(value.groups) &&
    value.groups.every(group => object(group) && typeof group.id === 'string' && identifier.test(group.id) &&
      isJobState(group.state) && (group.error_code === undefined || typeof group.error_code === 'string') &&
      (group.result === undefined || object(group.result) && Array.isArray(group.result.documents) &&
        group.result.documents.every(isReceiptDocument)));
}

function jobPath(id: string): ReceiptJobPath {
  if (!identifier.test(id)) throw new ReceiptAPIError(400, 'invalid_receipt_request');
  return `/v1/ai/receipt-jobs/${id}`;
}

function httpCode(status: number | null) {
  switch (status) {
    case 400: return 'invalid_receipt_request';
    case 401: return 'login_required';
    case 402: return 'insufficient_credit';
    case 404: return 'receipt_not_found';
    case 409: return 'request_conflict';
    default: return 'receipt_unavailable';
  }
}

function receiptFailure(error: unknown, signal?: AbortSignal): ReceiptAPIError {
  if (error instanceof ReceiptAPIError) return error;
  if (error instanceof DeviceProofHTTPError) return new ReceiptAPIError(error.status, error.code ?? httpCode(error.status));
  if (error instanceof IssuerUnavailable) {
    const cause = receiptFailure(error.cause, signal);
    return new ReceiptAPIError(cause.status, cause.code, error.mayHaveCommitted);
  }
  return new ReceiptAPIError(null, signal?.aborted ? 'cancelled' : 'receipt_unavailable');
}

async function receiptRequest<T>(op: ReceiptOperation, valid: (value: unknown) => value is T, signal?: AbortSignal): Promise<T> {
  let response: Awaited<ReturnType<typeof requestAndroidReceipt>>;
  try {
    response = await requestAndroidReceipt(op, signal);
  } catch (error) {
    throw receiptFailure(error, signal);
  }
  const value: unknown = await response.json().catch(() => null);
  if (!valid(value)) throw new ReceiptAPIError(response.status, 'invalid_receipt_response', op.method === 'POST');
  return value;
}

export function getReceiptConfig(signal?: AbortSignal): Promise<ReceiptConfig> {
  return receiptRequest({ method: 'GET', path: '/v1/ai/receipt-config' }, isReceiptConfig, signal);
}

export async function submitReceiptJob(id: string, input: ReceiptJobInput, signal?: AbortSignal): Promise<ReceiptJob> {
  const path = jobPath(id);
  return receiptRequest({ method: 'POST', path, body: JSON.stringify(input) },
    (value): value is ReceiptJob => isReceiptJob(value, id), signal);
}

export async function getReceiptJob(id: string, signal?: AbortSignal): Promise<ReceiptJob> {
  return receiptRequest({ method: 'GET', path: jobPath(id) },
    (value): value is ReceiptJob => isReceiptJob(value, id), signal);
}
