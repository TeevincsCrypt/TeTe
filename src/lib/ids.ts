/**
 * Collision-resistant id generation that survives a non-secure context.
 *
 * `crypto.randomUUID()` is only defined in a secure context. During development
 * a Mini App is loaded over plain HTTP from a LAN address (`http://192.168.x.x`),
 * where it is undefined — the Nimiq docs call this out explicitly. So we
 * feature-detect and fall back through `getRandomValues` to `Math.random`.
 */
export function createId(): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 12)}`;
}

/** Small, stable, non-cryptographic hash. Used to derive avatars from an address. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
