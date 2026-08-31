'use client';

import { Button } from '@/components/ui/Button';
import { Sticker } from '@/components/ui/Sticker';
import { useMiniApp } from '@/state/mini-app-provider';

/**
 * The onboarding moment: three lines and one button.
 *
 * Connecting calls `listAccounts()`, which raises the native Nimiq Pay
 * confirmation dialog — so it happens here, on a deliberate tap, and never on
 * page load. Nothing else is asked of a new player: no sign-up, no email, no
 * seed phrase. TeTe never sees a key.
 */
export function ConnectPanel() {
  const { host, nimiq, connectNimiq } = useMiniApp();

  return (
    <Sticker tone="cream" className="overflow-hidden">
      <p className="eyebrow text-ink/50">Step one</p>
      <h2 className="display mt-1.5 text-[1.5rem] text-ink">Bring your wallet</h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-ink/70">
        Nimiq Pay approves every move. Your keys never leave it, and TeTe never sees them.
      </p>

      <ol className="mt-4 space-y-2">
        {[
          'Connect in one tap',
          'Both players stake the same',
          'Winner takes the pot',
        ].map((step, index) => (
          <li key={step} className="flex items-center gap-2.5 text-[0.8125rem] font-semibold text-ink/80">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-[0.625rem] font-black text-lime tabular">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <Button
          onClick={connectNimiq}
          loading={nimiq.status === 'loading'}
          disabled={host === 'unavailable'}
        >
          {host === 'unavailable'
            ? 'Open in Nimiq Pay to connect'
            : nimiq.status === 'loading'
              ? 'Waiting for Nimiq Pay…'
              : 'Connect wallet'}
        </Button>

        {nimiq.status === 'error' && (
          <p
            role="alert"
            className={`mt-3 text-[0.8125rem] leading-relaxed ${
              nimiq.rejected ? 'text-ink/60' : 'text-negative'
            }`}
          >
            {nimiq.rejected ? 'No problem — tap Connect when you’re ready.' : nimiq.error}
          </p>
        )}
      </div>
    </Sticker>
  );
}
