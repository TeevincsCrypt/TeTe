/**
 * Read-only context Nimiq Pay seeds into the WebView before page scripts run
 * (`window.nimiqPay`).
 *
 * Phase 1 uses the host language so number and date formatting match what the
 * user picked in Nimiq Pay rather than the device locale.
 *
 * Deliberately NOT used yet: `requestDeviceIdentifier()` from the SDK, which
 * returns a pseudonymous per-origin device id. It prompts the user on first
 * call, so it belongs to the leaderboard/anti-spam work in a later phase, not
 * to onboarding. It identifies a device, not a person, and must never be used
 * as an identity for authentication.
 */

import { getHostLanguage } from '@nimiq/mini-app-sdk';

/** ISO 639-1 code chosen in Nimiq Pay, or undefined outside the host app. */
export function hostLanguage(): string | undefined {
  return getHostLanguage();
}

/**
 * Best-effort BCP 47 locale for `Intl` formatting.
 * Prefers the Nimiq Pay language, then the browser, then `en`.
 */
export function resolveLocale(): string {
  const host = hostLanguage();
  if (host) return host;
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  return 'en';
}
