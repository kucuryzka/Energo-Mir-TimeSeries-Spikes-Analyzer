export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseFileName(contentDisposition: string | undefined, fallback: string): string {
  if (!contentDisposition) return fallback;

  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }

  const plainMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return plainMatch?.[1] ?? fallback;
}

export function resolveDownloadFileName(
  contentDisposition: string | undefined,
  fallback: string,
): string {
  return parseFileName(contentDisposition, fallback);
}
