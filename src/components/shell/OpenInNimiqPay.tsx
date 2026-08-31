'use client';

import { useEffect, useState } from 'react';

import { PhoneIcon } from '@/components/shell/icons';
import { HoldButton } from '@/components/ui/HoldButton';
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
    <Sticker tone="contrast" className="overflow-hidden rounded-3xl p-6">
      <div className="flex items-center gap-2">
        <PhoneIcon className="size-4 text-on-contrast/60" />
        <Eyebrow className="text-on-contrast/60">Wallet features</Eyebrow>
      </div>

      <h2 className="display mt-2 text-[1.5rem] text-on-contrast">Open TeTe in Nimiq Pay</h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-on-contrast/70">
        TeTe is a Mini App — the wallet lives in Nimiq Pay. Have a look around here, then
        open it there to connect and play.
      </p>

      {bare && (
        <>
          <div className="mt-5 flex flex-col items-center">
            <HoldButton
              label="Hold to open in Nimiq Pay"
              holdingLabel="Keep holding"
              doneLabel="Opening"
              onConfirm={() => {
                window.location.href = `https://nimpay.app/miniapps/open/${bare}`;
              }}
            />
            <p className="mt-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-on-contrast/45">
              Hold the ring to confirm
            </p>
          </div>

          <p className="mt-4 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-on-contrast/45">
            Or paste into Mini Apps, Custom URL
          </p>
          <p className="mt-1.5 break-all rounded-xl bg-on-contrast/10 px-3 py-2.5 font-mono text-[0.75rem] leading-relaxed text-on-contrast/75">
            {origin}
          </p>
        </>
      )}
    </Sticker>
  );
}
