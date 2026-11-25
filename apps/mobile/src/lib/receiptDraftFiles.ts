import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { getReceiptMode, quoteReceiptCredits, type ReceiptConfig, type ReceiptJobInput, type ReceiptMode } from './androidReceiptClient';

export type ReceiptMimeType = 'image/jpeg' | 'image/png';
export type ReceiptPage = { id: string; uri: string; name: string; type: ReceiptMimeType; bytes: number };
export type ReceiptGroup = { id: string; pages: ReceiptPage[] };
export type PendingReceipt = { id: string; startedAt: number };

export const receiptPreviewEnabled = Platform.OS === 'android' && process.env.EXPO_PUBLIC_ANDROID_RECEIPT_ENABLED === 'true';
export const newReceiptID = () => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export function parsePendingReceipt(value: string | null): PendingReceipt | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<PendingReceipt> | null;
    if (typeof parsed?.id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(parsed.id) &&
        typeof parsed.startedAt === 'number' && Number.isSafeInteger(parsed.startedAt) && parsed.startedAt > 0) {
      return { id: parsed.id, startedAt: parsed.startedAt };
    }
  } catch {
    // Ignore damaged local job pointers.
  }
  return undefined;
}

export function receiptMimeType(signature: Uint8Array): ReceiptMimeType | undefined {
  if (signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) return 'image/jpeg';
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((byte, index) => signature[index] === byte)) return 'image/png';
  return undefined;
}

export async function inspectReceiptFile(uri: string): Promise<{ type: ReceiptMimeType; bytes: number }> {
  const file = new File(uri);
  if (!file.exists || file.size < 8) throw new Error('画像を読み込めませんでした。');

  const handle = file.open();
  try {
    const type = receiptMimeType(await handle.readBytes(8));
    if (!type) throw new Error('JPEGまたはPNGの画像を選んでください。');
    return { type, bytes: file.size };
  } finally {
    handle.close();
  }
}

export function removeReceiptFile(uri: string) {
  try {
    const cacheURI = Paths.cache.uri;
    if (!cacheURI.startsWith('file:///') || !uri.startsWith('file:///') || /[?#]/.test(uri)) return;
    // React Native's URL.pathname only parses HTTP(S) URLs.
    const cachePath = decodeURIComponent(cacheURI.slice('file://'.length)).replace(/\/+$/, '') + '/';
    const targetPath = decodeURIComponent(uri.slice('file://'.length));
    if (!targetPath.startsWith(cachePath) || targetPath === cachePath ||
        /[\\\0]/.test(targetPath) || targetPath.split('/').some((segment) => segment === '..' || segment === '.')) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The operating system may already have cleared the picker cache.
  }
}

export function buildReceiptInput(groups: readonly ReceiptGroup[], config: ReceiptConfig, mode?: ReceiptMode) {
  const pages = groups.flatMap((group) => group.pages);
  if (!groups.length || groups.length > config.max_groups ||
      groups.some((group) => !group.pages.length || group.pages.length > config.max_images_per_group) ||
      pages.length > config.max_total_images) {
    throw new Error('選んだ書類または画像が枚数の上限を超えています。');
  }
  if (pages.some((page) => page.bytes > config.max_image_bytes) ||
      pages.reduce((total, page) => total + page.bytes, 0) > config.max_total_image_bytes) {
    throw new Error('画像のファイルサイズが上限を超えています。');
  }

  const tariff = getReceiptMode(config, mode);
  const input: ReceiptJobInput = {
    maximum_credit: quoteReceiptCredits(config, pages.length, tariff.id),
    price_version: tariff.price_version,
    ...(config.modes ? { mode: tariff.id } : {}),
    request: {
      groups: groups.map((group, groupIndex) => ({
        id: group.id,
        images: group.pages.map((page, pageIndex) => ({
          id: `g${groupIndex + 1}-p${pageIndex + 1}`, mime_type: page.type, data: '',
        })),
      })),
    },
  };
  // IDs, price versions, MIME types and base64 are validated as ASCII.
  const envelopeBytes = JSON.stringify(input.request).length;
  if (envelopeBytes + pages.reduce((total, page) => total + 4 * Math.ceil(page.bytes / 3), 0) > config.max_json_bytes) {
    throw new Error('送信できるデータ量の上限を超えています。画像を減らしてください。');
  }
  return input;
}

export async function attachReceiptImages(input: ReceiptJobInput, groups: readonly ReceiptGroup[]) {
  for (const [groupIndex, group] of input.request.groups.entries()) {
    for (const [pageIndex, image] of group.images.entries()) {
      const page = groups[groupIndex].pages[pageIndex];
      const current = await inspectReceiptFile(page.uri);
      if (current.bytes !== page.bytes || current.type !== page.type) {
        throw new Error('選んだ画像が変わりました。画像を選び直してください。');
      }
      image.data = await new File(page.uri).base64();
    }
  }
  return input;
}

export function receiptExpenseDate(date: string | undefined) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000-')) return undefined;
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== date ? undefined : date;
}
