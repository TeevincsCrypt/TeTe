/**
 * The player's local display name.
 *
 * TeTe has no accounts and no backend: identity is the connected Nimiq address.
 * A display name is pure local decoration so the app can greet someone by
 * something friendlier than `NQ34 248H…`. It never leaves the device.
 */
import { hashString } from '@/lib/ids';

const KEY = 'tete.display-name.v1';

export function readDisplayName(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeDisplayName(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = name.trim();
    if (trimmed) window.localStorage.setItem(KEY, trimmed);
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent('tete:profile-changed'));
  } catch {
    /* Storage unavailable. The name just is not remembered. */
  }
}

const HANDLE_PARTS = [
  'Rook', 'Blitz', 'Vector', 'Onyx', 'Comet', 'Nova', 'Quartz', 'Falcon',
  'Ember', 'Cipher', 'Drift', 'Apex', 'Halo', 'Vertex', 'Prism', 'Storm',
];

/**
 * A stable default handle derived from the address, so a new player has an
 * identity on first open instead of a blank field. Deterministic: the same
 * address always yields the same handle.
 */
export function defaultHandle(address: string | null): string {
  if (!address) return 'Challenger';
  const hash = hashString(address);
  const part = HANDLE_PARTS[hash % HANDLE_PARTS.length] ?? 'Player';
  return `${part}${(hash % 900) + 100}`;
}

const AVATAR_KEY = 'tete.avatar.v1';

/** Chosen avatar variant, or null to stay with the address-derived default. */
export function readAvatarSeed(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AVATAR_KEY);
    const value = raw === null ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isInteger(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeAvatarSeed(seed: number | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (seed === null) window.localStorage.removeItem(AVATAR_KEY);
    else window.localStorage.setItem(AVATAR_KEY, String(seed));
    window.dispatchEvent(new CustomEvent('tete:profile-changed'));
  } catch {
    /* Storage unavailable. */
  }
}

const PHOTO_KEY = 'tete.photo.v1';
/** Stored as a data URL in localStorage, which is small and has a hard cap. */
export const MAX_PHOTO_BYTES = 120_000;

export function readPhoto(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(PHOTO_KEY);
  } catch {
    return null;
  }
}

export function writePhoto(dataUrl: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (dataUrl) window.localStorage.setItem(PHOTO_KEY, dataUrl);
    else window.localStorage.removeItem(PHOTO_KEY);
    window.dispatchEvent(new CustomEvent('tete:profile-changed'));
  } catch {
    /* Storage full or unavailable; the picture is simply not kept. */
  }
}

/**
 * Downscale a chosen image to a square thumbnail before storing it.
 *
 * A phone photo is several megabytes, which would blow the localStorage quota
 * outright. Cropping to a centred square and re-encoding as JPEG keeps it in
 * the tens of kilobytes, and the picture is only ever shown small.
 */
export async function preparePhoto(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image.');
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();

  // Step the quality down until it fits, rather than failing on a large photo.
  for (const quality of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_PHOTO_BYTES) return url;
  }
  throw new Error('That image is too large, even compressed.');
}
