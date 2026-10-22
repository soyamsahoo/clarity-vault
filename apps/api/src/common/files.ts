import fs from 'node:fs/promises';

export async function safeUnlink(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    // best effort cleanup
  }
}

export function randomCode(prefix: string, length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes)
    .map((byte) => alphabet[byte % alphabet.length])
    .join('');
  return `${prefix}-${body}`;
}
