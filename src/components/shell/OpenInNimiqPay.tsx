'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

import { CheckIcon, PhoneIcon } from '@/components/shell/icons';
import { HoldButton } from '@/components/ui/HoldButton';
import { cn } from '@/components/ui/cn';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { copyText } from '@/lib/clipboard';
import { APP_URL } from '@/lib/config/env';

/**
 * Shown when no wallet provider was injected — TeTe is open in a normal browser
 * rather than inside Nimiq Pay.
 *
 * Two routes in, and which one works depends on whether the app is listed:
 *
 *  - `nimiqpay://miniapp?url=…` hands straight to the installed app. Nimiq Pay
 *    warns before loading a URL it does not recognise, but it does proceed, so
 *    this works for an app that is not in the directory yet.
 *  - `https://nimpay.app/miniapps/open/…` is the documented HTTPS equivalent.
 *    The docs say it "works with any domain"; in practice it answers 404 —
 *    "this app isn't in the directory" — for anything unlisted. So it is not
 *    used here until TeTe is submitted to the catalogue.
 *
 * A custom scheme also fails silently when the app is not installed, and does
 * nothing at all on a desktop browser. So the pasteable URL is always offered
 * rather than hidden behind a failure nobody can detect.
 */
export function OpenInNimiqPay() {
  const [origin, setOrigin] = useState<string | null>(APP_URL ?? null);
  const [tried, setTried] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!APP_URL && typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const bare = origin?.replace(/^https?:\/\//, '').replace(/\/$/, '');

  function open() {
    if (!bare) return;
    // Nothing observable happens if the scheme is unhandled, so reveal the
    // manual route a moment later rather than leaving the player stuck.
    window.location.href = `nimiqpay://miniapp?url=${bare}`;
    setTimeout(() => setTried(true), 1200);
  }

  return (
    <Sticker tone="contrast" className="overflow-hidden rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <Image src="/brand/logo-128.png" alt="" width={38} height={38} className="rounded-[28%]" />
        <div className="flex items-center gap-1.5">
          <PhoneIcon className="size-3.5 text-on-contrast/60" />
          <Eyebrow className="text-on-contrast/60">Wallet features</Eyebrow>
        </div>
      </div>

      <h2 className="display mt-3 text-[1.5rem] text-on-contrast">Open TeTe in Nimiq Pay</h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-on-contrast/70">
        TeTe is a Mini App — the wallet lives in Nimiq Pay. Have a look around here, then
        open it there to connect and play.
      </p>

      {bare && (
        <>
          <div className="mt-6">
            <HoldButton
              label="Hold to open"
              holdingLabel="Keep holding"
              doneLabel="Handing over"
              onConfirm={open}
            />
          </div>

          <div
            className={cn(
              'mt-6 border-t border-on-contrast/15 pt-5 transition-opacity duration-500',
              tried ? 'opacity-100' : 'opacity-70',
            )}
          >
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-on-contrast/45">
              {tried ? 'Nothing happened? Do it manually' : 'Or open it manually'}
            </p>
            <p className="mt-2 text-[0.75rem] leading-relaxed text-on-contrast/60">
              In Nimiq Pay, go to <span className="font-bold text-on-contrast/85">Mini Apps</span> and paste
              this into the Custom URL field.
            </p>

            <button
              type="button"
              onClick={async () => setCopied(await copyText(origin ?? ''))}
              className={cn(
                'mt-3 flex w-full items-center justify-between gap-3 rounded-xl bg-on-contrast/10 px-3.5 py-3',
                'text-left transition-colors duration-200 active:bg-on-contrast/20',
              )}
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-on-contrast/75">
                {origin}
              </span>
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1 text-[0.6875rem] font-bold',
                  copied ? 'text-positive' : 'text-accent',
                )}
              >
                {copied && <CheckIcon className="size-3" strokeWidth={3} />}
                {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
          </div>
        </>
      )}
    </Sticker>
  );
}
