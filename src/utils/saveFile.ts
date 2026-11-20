export type SaveFileResult = 'shared' | 'download-started' | 'cancelled' | 'failed';

/**
 * Save/export a file the way the OS expects:
 *  - Phones/tablets (iOS PWA especially, where <a download> is unreliable): native Share Sheet
 *    ("Save to Files", AirDrop, Mail…) via the Web Share API with files.
 *  - Desktop: normal browser download.
 */
export async function saveFile(blob: Blob, filename: string): Promise<SaveFileResult> {
  const isTouch =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches ?? false);

  if (isTouch && typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      }
    } catch (e) {
      // User dismissed the sheet: nothing more to do. Other errors fall back to download.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    try {
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      return 'download-started';
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch {
    return 'failed';
  }
}
