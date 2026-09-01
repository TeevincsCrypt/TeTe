'use client';

import { useCallback, useEffect, useState } from 'react';

import { WalletIcon } from '@/components/shell/icons';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { ApiError, fetchRewardBalance, fetchStatus, withdrawRewards } from '@/lib/api/client';
import { EXPLORER_TX_URL } from '@/lib/config/env';
import { copyText } from '@/lib/clipboard';
import { pushNotice } from '@/lib/notifications/notifications';
import { formatNim, LUNA_PER_NIM } from '@/lib/nimiq/units';
import { PAYOUT_THRESHOLD_LUNA } from '@/lib/wallet/earnings';
import { useEarnings } from '@/state/use-earnings';
import { useMiniApp } from '@/state/mini-app-provider';

type Tab = 'earnings' | 'withdraw';

/**
 * Wallet: what the player has earned, and taking it out.
 *
 * There is no deposit tab. Money only ever enters TeTe for a reason — funding
 * a challenge you have accepted — and that happens on the challenge itself,
 * where the amount and the recipient are already known. A free-floating
 * "send some NIM to the pool" screen was a way to lose money to no purpose.
 *
 * The headline figure is the server's, not this device's. Rewards are credited
 * server-side as rounds are finished, so the local ledger below is a history
 * of rounds played, not the balance of record.
 */
export default function WalletPage() {
  const [tab, setTab] = useState<Tab>('earnings');
  const { entries } = useEarnings();
  const { nimiq, locale } = useMiniApp();
  const address = nimiq.address;

  const [balance, setBalance] = useState<number | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    const [status, earned] = await Promise.all([fetchStatus(), fetchRewardBalance(address)]);
    setReady(status.escrow);
    setBalance(earned);
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shown = balance ?? 0;

  return (
    <div className="pt-1">
      <header className="border-b border-line pb-5">
        <Eyebrow className="text-faint">Wallet</Eyebrow>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-faint">
              Earned, not withdrawn
            </p>
            <p className="mt-1 text-[2.5rem] font-black leading-none tracking-[-0.035em] tabular">
              {formatNim(shown, { locale })}
              <span className="ml-2 text-[1rem] text-faint">NIM</span>
            </p>
          </div>
          <span className="flex size-11 items-center justify-center rounded-2xl bg-contrast text-accent">
            <WalletIcon className="size-5" />
          </span>
        </div>
        {balance === null ? (
          <Chip tone="warn" className="mt-3">
            {address ? 'Rewards not configured here' : 'Connect to see your balance'}
          </Chip>
        ) : (
          <Chip tone={shown > 0 ? 'positive' : 'neutral'} className="mt-3">
            Real balance · withdrawable from {PAYOUT_THRESHOLD_LUNA / LUNA_PER_NIM} NIM
          </Chip>
        )}
      </header>

      <SlidingTabs<Tab>
        className="mt-5"
        value={tab}
        onChange={setTab}
        options={[
          { id: 'earnings', label: 'Earned' },
          { id: 'withdraw', label: 'Withdraw' },
        ]}
      />

      {tab === 'earnings' && (
        <section className="mt-5">
          {entries.length === 0 ? (
            <div className="rounded-2xl bg-panel-2 px-5 py-10 text-center">
              <p className="text-[0.9375rem] font-bold">Nothing earned yet</p>
              <p className="mx-auto mt-1.5 max-w-[17rem] text-[0.8125rem] leading-relaxed text-muted">
                Play a game in the Arcade or keep a daily streak and it lands here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {entries.slice(0, 30).map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-bold">{entry.label}</span>
                    <span className="block text-[0.6875rem] text-faint">
                      {new Date(entry.at).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.9375rem] font-black text-accent-text tabular">
                    +{formatNim(entry.luna, { locale, maximumFractionDigits: 3 })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <PhaseNote className="mt-4">
            This list is the rounds played on this device. The balance above is the
            server&apos;s record of what you have earned and not yet withdrawn — that is the
            one that pays out.
          </PhaseNote>
        </section>
      )}

      {tab === 'withdraw' && (
        <WithdrawPanel
          balance={balance}
          ready={ready}
          address={address}
          locale={locale}
          onDone={refresh}
        />
      )}
    </div>
  );
}

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent'; sent: number; transaction: string }
  | { status: 'error'; message: string };

/**
 * A real payout. The server checks the signature, reads what it has credited,
 * zeroes it, and sends from the treasury — the amount is never taken from
 * this screen, because a client-supplied balance is a client-supplied
 * withdrawal limit.
 */
function WithdrawPanel({
  balance,
  ready,
  address,
  locale,
  onDone,
}: {
  balance: number | null;
  ready: boolean | null;
  address: string | null;
  locale: string;
  onDone: () => void;
}) {
  const [send, setSend] = useState<SendState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);

  const total = balance ?? 0;
  const enough = total >= PAYOUT_THRESHOLD_LUNA;

  async function withdraw() {
    if (!address) return;
    setSend({ status: 'sending' });
    try {
      const result = await withdrawRewards(address);
      setSend({ status: 'sent', sent: result.sent, transaction: result.transaction });
      pushNotice('reward', 'Withdrawal sent', `${formatNim(result.sent)} NIM is on its way.`);
      onDone();
    } catch (cause: unknown) {
      setSend({
        status: 'error',
        message: cause instanceof ApiError ? cause.message : 'The payout failed.',
      });
    }
  }

  if (send.status === 'sent') {
    const link = EXPLORER_TX_URL?.replace('{hash}', send.transaction);
    return (
      <Sticker tone="contrast" className="mt-5 rounded-3xl p-6 text-center">
        <p className="text-[1.5rem] font-black">{formatNim(send.sent, { locale })} NIM sent</p>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-on-contrast/70">
          The treasury signed and broadcast it. It lands in your wallet once it confirms.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <p className="min-w-0 truncate font-mono text-[0.6875rem] text-on-contrast/60">
            {send.transaction}
          </p>
          <button
            type="button"
            onClick={async () => setCopied(await copyText(send.transaction))}
            className={cn('shrink-0 text-[0.6875rem] font-bold', copied ? 'text-positive' : 'text-accent')}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-[0.6875rem] font-bold text-accent"
            >
              View
            </a>
          )}
        </div>
        <Button className="mt-5" onClick={() => setSend({ status: 'idle' })}>
          Done
        </Button>
      </Sticker>
    );
  }

  return (
    <section className="mt-5 space-y-3">
      <Sticker tone="panel">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Eyebrow className="text-faint">Available now</Eyebrow>
            <p className="mt-1.5 text-[1.75rem] font-black leading-none tabular">
              {formatNim(total, { locale })}
              <span className="ml-1.5 text-[0.8125rem] text-faint">NIM</span>
            </p>
          </div>
          <Chip tone={enough ? 'positive' : 'neutral'}>
            Min {PAYOUT_THRESHOLD_LUNA / LUNA_PER_NIM} NIM
          </Chip>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-panel">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500',
              enough ? 'bg-positive' : 'bg-accent',
            )}
            style={{ width: `${Math.min(100, (total / PAYOUT_THRESHOLD_LUNA) * 100)}%` }}
          />
        </div>
      </Sticker>

      <Sticker tone="panel">
        <Eyebrow className="text-faint">Paying out to</Eyebrow>
        <p className="mt-2 break-all font-mono text-[0.75rem] leading-relaxed text-muted">
          {address ?? 'Connect your wallet to set a destination.'}
        </p>
      </Sticker>

      <Button
        onClick={withdraw}
        disabled={!address || !enough || ready === false}
        loading={send.status === 'sending'}
        size="lg"
      >
        {!address
          ? 'Connect your wallet first'
          : ready === false
            ? 'Payouts not configured here'
            : enough
              ? `Withdraw ${formatNim(total, { locale })} NIM`
              : `${formatNim(PAYOUT_THRESHOLD_LUNA - total, { locale })} NIM to go`}
      </Button>

      {send.status === 'error' && (
        <p role="alert" className="text-[0.8125rem] leading-relaxed text-negative">
          {send.message}
        </p>
      )}

      <PhaseNote>
        Withdrawing asks Nimiq Pay to sign, proving the address is yours, and the
        treasury sends the whole balance in one transaction. The minimum exists so a
        payout is worth more than the transaction that carries it.
      </PhaseNote>
    </section>
  );
}
