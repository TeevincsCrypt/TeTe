/**
 * The referral code a `?ref=` link left behind, remembered locally until
 * this player claims a TeTe name — the one signed moment that can actually
 * attribute it to them. Purely a local hint: it commits nothing and pays out
 * nothing by itself. See lib/server/referrals.ts for where it becomes real.
 */
const KEY = 'tete.referred-by.v1';

export function readReferredBy(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** First one wins — a later link on the same device does not overwrite it. */
export function rememberReferredBy(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!window.localStorage.getItem(KEY)) window.localStorage.setItem(KEY, code);
  } catch {
    /* Storage unavailable. Worst case, this visit just does not carry a code. */
  }
}

export function clearReferredBy(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* Nothing to do. */
  }
}
