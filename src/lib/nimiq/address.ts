/**
 * Nimiq user-friendly addresses look like:
 *   NQ07 0000 0000 0000 0000 0000 0000 0000 0000
 * — the literal prefix "NQ", a 2-digit checksum, then 32 base-32 characters,
 * conventionally rendered in 9 space-separated blocks of 4.
 *
 * `listAccounts()` returns addresses in this user-friendly form. These helpers
 * only normalise presentation; they never validate ownership or checksums,
 * which is the wallet's job.
 */

const ADDRESS_BODY = /^NQ[0-9]{2}[0-9A-HJ-NP-VXY]{32}$/;

/** Strip whitespace and upper-case, giving the canonical compact form. */
export function compactAddress(address: string): string {
  return address.replace(/\s+/g, '').toUpperCase();
}

/** True when the string has the shape of a Nimiq user-friendly address. */
export function isNimiqAddressShape(address: string): boolean {
  return ADDRESS_BODY.test(compactAddress(address));
}

/** Render as the canonical 9 blocks of 4 characters. */
export function formatAddress(address: string): string {
  const compact = compactAddress(address);
  return compact.match(/.{1,4}/g)?.join(' ') ?? compact;
}

/**
 * Shorten for tight UI (chips, list rows): first two blocks, an ellipsis, and
 * the last block. Falls back to the full address when it is already short.
 */
export function shortenAddress(address: string): string {
  const blocks = formatAddress(address).split(' ');
  if (blocks.length <= 4) return blocks.join(' ');
  return `${blocks[0]} ${blocks[1]}…${blocks[blocks.length - 1]}`;
}
