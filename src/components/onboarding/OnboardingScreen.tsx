'use client';

import { useEffect, useState } from 'react';

import { BrandMark } from '@/components/shell/BrandMark';
import { Button } from '@/components/ui/Button';
import { APP_URL } from '@/lib/config/env';
import { useMiniApp } from '@/state/mini-app-provider';

/**
 * Onboarding is one screen and one decision: connect.
 *
 * Connecting calls `listAccounts()`, which raises the native Nimiq Pay
 * confirmation dialog — so it happens here, on a deliberate tap, and never on
 * page load. Nothing else is asked of the user: no sign-up, no email, no seed
 * phrase. TeTe never sees a key.
 */
export function OnboardingScreen() {
  const { host, nimiq, connectNimiq } = useMiniApp();

  if (host === 'checking') return <ConnectingSplash />;
  if (host === 'unavailable') return <OutsideNimiqPay />;

  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col animate-[var(--animate-rise)]">
      <header className="pt-6">
        <BrandMark className="text-2xl" />
      </header>

      <div className="flex flex-1 flex-col justify-center py-10">
        <h1 className="text-[2.5rem] font-black leading-[1.05] tracking-[-0.04em]">
          Challenge
          <br />
          anyone.
          <br />
          <span className="text-accent">Win on skill.</span>
        </h1>
        <p className="mt-5 max-w-[22rem] text-[0.9375rem] leading-relaxed text-muted">
          Set a challenge, agree a stake in NIM or USDT, and let the result decide who takes it.
          No luck, no house edge — just skill.
        </p>

        <ol className="mt-9 space-y-4">
          <Step index={1} title="Connect your wallet">
            Nimiq Pay approves every action. Your keys never leave it.
          </Step>
          <Step index={2} title="Agree the stake">
            Both players put up the same amount in NIM or USDT.
          </Step>
          <Step index={3} title="Play and settle">
            Confirm the result, and the stake goes to the winner.
          </Step>
        </ol>
      </div>

      <div className="pb-2">
        {nimiq.status === 'error' && (
          <p
            role="alert"
            className={`mb-3 text-[0.8125rem] leading-relaxed ${
              nimiq.rejected ? 'text-muted' : 'text-negative'
            }`}
          >
            {nimiq.rejected
              ? 'No problem — tap Connect whenever you are ready.'
              : nimiq.error}
          </p>
        )}
        <Button onClick={connectNimiq} loading={nimiq.status === 'loading'}>
          {nimiq.status === 'loading' ? 'Waiting for Nimiq Pay…' : 'Connect wallet'}
        </Button>
        <p className="mt-3 text-center text-[0.75rem] leading-relaxed text-faint">
          Nimiq Pay will ask you to approve sharing your address.
        </p>
      </div>
    </div>
  );
}

function Step({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[0.75rem] font-bold text-accent tabular">
        {index}
      </span>
      <div>
        <p className="text-[0.9375rem] font-semibold tracking-tight">{title}</p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}

function ConnectingSplash() {
  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col items-center justify-center gap-4">
      <BrandMark className="text-3xl" />
      <p className="text-[0.8125rem] text-faint">Looking for Nimiq Pay…</p>
    </div>
  );
}

/**
 * TeTe is a Mini App: outside Nimiq Pay there is no wallet to talk to. Rather
 * than a dead end, this hands over the two ways in — the deeplink for a phone,
 * and the raw URL to paste into Nimiq Pay's Custom URL field during development.
 */
function OutsideNimiqPay() {
  const [origin, setOrigin] = useState<string | null>(APP_URL ?? null);

  useEffect(() => {
    if (!APP_URL && typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const bare = origin?.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col justify-center gap-7 animate-[var(--animate-rise)]">
      <div>
        <BrandMark className="text-2xl" />
        <h1 className="mt-6 text-[1.75rem] font-black leading-tight tracking-[-0.035em]">
          Open TeTe inside Nimiq Pay
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          TeTe is a Mini App. It needs the wallet Nimiq Pay provides, so it only works from
          inside the app.
        </p>
      </div>

      {bare && (
        <div className="rounded-[var(--radius-card)] border border-line-soft bg-surface p-5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-faint">
            On your phone
          </p>
          <a
            href={`https://nimpay.app/miniapps/open/${bare}`}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-6 text-[0.9375rem] font-semibold tracking-tight text-accent-ink transition-transform active:scale-[0.985]"
          >
            Open in Nimiq Pay
          </a>
          <p className="mt-5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-faint">
            Or paste this into Mini Apps → Custom URL
          </p>
          <p className="mt-2 break-all rounded-lg bg-surface-2 px-3 py-2.5 font-mono text-[0.75rem] leading-relaxed text-muted">
            {origin}
          </p>
        </div>
      )}
    </div>
  );
}
