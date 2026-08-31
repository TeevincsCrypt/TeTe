/**
 * Nimiq amounts are integers of Luna, the smallest NIM unit.
 * 1 NIM = 100_000 Luna (5 decimals), per the Nimiq provider API reference.
 *
 * We keep Luna as the canonical representation everywhere in TeTe (stakes,
 * escrow amounts, payouts) and format to NIM only at the UI edge. Float maths
 * on money is a bug factory, so conversions round explicitly.
 */

export const LUNA_PER_NIM = 100_000;
export const NIM_DECIMALS = 5;

/** Convert an integer Luna amount to a NIM number. Display only. */
export function lunaToNim(luna: number): number {
  return luna / LUNA_PER_NIM;
}

/** Convert a NIM amount to integer Luna, rounding to the nearest Luna. */
export function nimToLuna(nim: number): number {
  return Math.round(nim * LUNA_PER_NIM);
}

/**
 * Format a Luna amount as a NIM string.
 *
 * Defaults to 2 fraction digits, which is what reads well in a balance card.
 * Pass `maximumFractionDigits: NIM_DECIMALS` when exactness matters (for
 * example when confirming an escrow amount).
 */
export function formatNim(
  luna: number,
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number; locale?: string } = {},
): string {
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = Math.max(minimumFractionDigits, 2),
    locale,
  } = options;

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(lunaToNim(luna));
}
