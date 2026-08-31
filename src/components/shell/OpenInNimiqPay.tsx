'use client';

import { useEffect, useState } from 'react';

import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { APP_URL } from '@/lib/config/env';

/**
 * Shown when no wallet provider was injected — TeTe is open in a normal browser
 * rather than inside Nimiq Pay.
 *
 * It does not block the app: every screen stays browsable so the product can be
 * explored anywhere, and the wallet-backed numbers report honestly that there is
 * no wallet to read. What this panel adds is the way in — a deeplink for a
 * phone, and the raw URL for Nimiq Pay's Custom URL field during development.
 */
export function OpenInNimiqPay() {
  const [origin, setOrigin] = useState<string | null>(APP_URL ?? null);

  useEffect(() => {
    if (!APP_URL && typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const bare = origin?.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <Sticker tone="contrast" className="overflow-hidden">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-[1.125rem] leading-none">📱</span>
        <Eyebrow className="text-on-contrast/60">Wallet features</Eyebrow>
      </div>

      <h2 className="display mt-2 text-[1.5rem] text-on-contrast">Open TeTe in Nimiq Pay</h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-on-contrast/70">
        TeTe is a Mini App — the wallet lives in Nimiq Pay. Have a look around here, then
        open it there to connect and play.
      </p>

      {bare && (
        <>
          <a
            href={`https://nimpay.app/miniapps/open/${bare}`}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full border-2 border-ink bg-accent px-6 text-[0.9375rem] font-bold text-on-accent shadow-[var(--shadow-sticker)] transition-transform duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            Open in Nimiq Pay
          </a>

          <p className="mt-4 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-on-contrast/45">
            Or paste into Mini Apps → Custom URL
          </p>
          <p className="mt-1.5 break-all rounded-xl bg-on-contrast/10 px-3 py-2.5 font-mono text-[0.75rem] leading-relaxed text-on-contrast/75">
            {origin}
          </p>
        </>
      )}
    </Sticker>
  );
}
