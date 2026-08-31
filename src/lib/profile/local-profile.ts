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
