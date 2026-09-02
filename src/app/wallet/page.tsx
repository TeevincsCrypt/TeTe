'use client';

import { useCallback, useEffect, useState } from 'react';

import { WalletIcon } from '@/components/shell/icons';
import { PlayerFace } from '@/components/ui/PlayerFace';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import {
  ApiError,
  fetchActivity,
  fetchRewardBalance,
  fetchStatus,
  lookupPlayer,
  tipPlayer,
  withdrawRewards,
  type ActivityEntry,
  type ActivityKind,
  type DirectoryPlayer,
} from '@/lib/api/client';
import { EXPLORER_TX_URL } from '@/lib/config/env';
import { copyText } from '@/lib/clipboard';
import { pushNotice } from '@/lib/notifications/notifications';
import { compactAddress } from '@/lib/nimiq/address';
import { formatNim, LUNA_PER_NIM } from '@/lib/nimiq/units';
import { PAYOUT_THRESHOLD_LUNA } from '@/lib/wallet/earnings';
import { useEarnings } from '@/state/use-earnings';
import { useMiniApp } from '@/state/mini-app-provider';

type Tab = 'earnings' | 'withdraw' | 'tip';

/**
 * Wallet: what the player has earned, and taking it out.
 *
 * There is no deposit tab. Money only ever enters TeTe for a reason — funding
 * a challenge you have accepted — and that happens on the challenge itself,
 * where the amount and the recipient are already known. A free-floating
 * "send some NIM to the pool" screen was a way to lose money to no purpose.
 *
 * Both the balance and the history are the server's, not this device's. A
 * device-local list can only know what this phone did, which is why being
 * tipped appeared nowhere: the money arrived and nothing on the phone had
 * been party to it.
 */
export default function WalletPage() {
  const [tab, setTab] = useState<Tab>('earnings');
  const { entries } = useEarnings();
  const { nimiq, locale } = useMiniApp();
  const address = nimiq.address;

  const [balance, setBalance] = useState<number | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);

  // Notices link straight to a tab, so honour ?tab= on arrival.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab');
    if (wanted === 'withdraw' || wanted === 'tip' || wanted === 'earnings') setTab(wanted);
  }, []);

  const refresh = useCallback(async () => {
    if (!address) return;
    const [status, earned, feed] = await Promise.all([
      fetchStatus(),
      fetchRewardBalance(address),
      fetchActivity(address),
    ]);
    setReady(status.escrow);
    setBalance(earned);
    setActivity(feed);
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
          { id: 'tip', label: 'Tip' },
        ]}
      />

      {tab === 'earnings' && (
        <ActivityList activity={activity} localEntries={entries} locale={locale} />
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

      {tab === 'tip' && (
        <TipPanel balance={balance} address={address} locale={locale} onDone={refresh} />
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

type TipState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent'; sent: number; username: string }
  | { status: 'error'; message: string };

const MIN_TIP_LUNA = 10_000;

/**
 * Send someone NIM by username.
 *
 * This moves NIM between TeTe balances rather than sending a transaction: no
 * fee, instant, and it works below the withdrawal minimum — which is the whole
 * point, since a 1 NIM tip is not worth a payout of its own. The recipient can
 * withdraw it exactly like anything else they have earned.
 *
 * The username is resolved before sending so nobody tips into a typo, and the
 * signature names both the recipient and the amount, so it cannot be replayed
 * as a different tip.
 */
function TipPanel({
  balance,
  address,
  locale,
  onDone,
}: {
  balance: number | null;
  address: string | null;
  locale: string;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [found, setFound] = useState<DirectoryPlayer | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'searching' | 'missing' | 'found'>('idle');
  const [send, setSend] = useState<TipState>({ status: 'idle' });

  const total = balance ?? 0;
  const query = name.trim();

  useEffect(() => {
    if (query.length < 3) {
      setLookup('idle');
      setFound(null);
      return;
    }
    let cancelled = false;
    setLookup('searching');
    const timer = setTimeout(async () => {
      try {
        const player = await lookupPlayer(query);
        if (cancelled) return;
        if (!player || (address && compactAddress(player.address) === compactAddress(address))) {
          setFound(null);
          setLookup('missing');
          return;
        }
        setFound(player);
        setLookup('found');
      } catch {
        if (!cancelled) {
          setFound(null);
          setLookup('missing');
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, address]);

  const luna = Math.round(Number(amount) * LUNA_PER_NIM);
  const amountValid = Number.isInteger(luna) && luna >= MIN_TIP_LUNA && luna <= total;
  const canSend = Boolean(address && found && amountValid && send.status !== 'sending');

  async function tip() {
    if (!address || !found) return;
    setSend({ status: 'sending' });
    try {
      const result = await tipPlayer(address, found.username, luna);
      setSend({ status: 'sent', sent: result.sent, username: result.username });
      pushNotice('reward', 'Tip sent', `${formatNim(result.sent)} NIM to @${result.username}.`);
      setAmount('');
      setName('');
      setFound(null);
      setLookup('idle');
      onDone();
    } catch (cause: unknown) {
      setSend({
        status: 'error',
        message: cause instanceof ApiError ? cause.message : 'The tip failed.',
      });
    }
  }

  if (send.status === 'sent') {
    return (
      <Sticker tone="contrast" className="mt-5 rounded-3xl p-6 text-center">
        <p className="text-[1.5rem] font-black">{formatNim(send.sent, { locale })} NIM</p>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-on-contrast/70">
          Sent to @{send.username}. It is in their TeTe balance now — they can withdraw it
          whenever they like.
        </p>
        <Button className="mt-5" onClick={() => setSend({ status: 'idle' })}>
          Send another
        </Button>
      </Sticker>
    );
  }

  return (
    <section className="mt-5 space-y-3">
      <Sticker tone="panel">
        <Eyebrow className="text-faint">Tip from your balance</Eyebrow>
        <p className="mt-1.5 text-[1.75rem] font-black leading-none tabular">
          {formatNim(total, { locale })}
          <span className="ml-1.5 text-[0.8125rem] text-faint">NIM available</span>
        </p>
      </Sticker>

      <Sticker tone="panel">
        <label htmlFor="tip-name" className="eyebrow text-faint">
          Who
        </label>
        <div className="mt-2.5 flex items-center rounded-xl border border-line bg-panel-2 pl-3.5 focus-within:border-accent">
          <span className="text-[1rem] font-black text-faint">@</span>
          <input
            id="tip-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSend({ status: 'idle' });
            }}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={16}
            className="w-full min-w-0 bg-transparent px-1.5 py-3 text-[1rem] font-bold text-text placeholder:text-faint focus:outline-none"
          />
          {lookup === 'searching' && (
            <span className="mr-3 size-4 shrink-0 animate-spin rounded-full border-2 border-faint border-t-transparent" />
          )}
        </div>

        {lookup === 'missing' && (
          <p className="mt-2 text-[0.75rem] font-semibold text-negative">
            No player called @{query} — they claim their name in TeTe first.
          </p>
        )}

        {found && lookup === 'found' && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-contrast p-3">
            <PlayerFace address={found.address} size={36} />
            <p className="display text-[1rem] text-on-contrast">@{found.username}</p>
          </div>
        )}
      </Sticker>

      <Sticker tone="panel">
        <label htmlFor="tip-amount" className="eyebrow text-faint">
          How much
        </label>
        <div className="mt-2.5 flex items-center rounded-xl border border-line bg-panel-2 px-3.5 focus-within:border-accent">
          <input
            id="tip-amount"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value.replace(/[^0-9.]/g, ''));
              setSend({ status: 'idle' });
            }}
            inputMode="decimal"
            placeholder="0.00"
            className="w-full min-w-0 bg-transparent py-3 text-[1rem] font-bold text-text placeholder:text-faint focus:outline-none tabular"
          />
          <span className="shrink-0 text-[0.8125rem] font-bold text-faint">NIM</span>
        </div>
        {amount !== '' && !amountValid && (
          <p className="mt-2 text-[0.75rem] font-semibold text-negative">
            {luna > total
              ? `You only have ${formatNim(total, { locale })} NIM.`
              : `The smallest tip is ${MIN_TIP_LUNA / LUNA_PER_NIM} NIM.`}
          </p>
        )}
      </Sticker>

      <Button onClick={tip} disabled={!canSend} loading={send.status === 'sending'} size="lg">
        {!address
          ? 'Connect your wallet first'
          : !found
            ? 'Find a player to tip'
            : !amountValid
              ? 'Enter an amount'
              : `Tip @${found.username} ${formatNim(luna, { locale })} NIM`}
      </Button>

      {send.status === 'error' && (
        <p role="alert" className="text-[0.8125rem] leading-relaxed text-negative">
          {send.message}
        </p>
      )}

      <PhaseNote>
        A tip moves NIM straight from your TeTe balance to theirs — no transaction fee, and
        no waiting for the chain. Signing proves the balance being spent is yours.
      </PhaseNote>
    </section>
  );
}

const KIND_LABEL: Record<ActivityKind, string> = {
  'tip-in': 'Tip received',
  'tip-out': 'Tip sent',
  reward: 'Arcade',
  'check-in': 'Daily check-in',
  withdrawal: 'Withdrawal',
  payout: 'Challenge won',
};

/**
 * Everything that moved this balance, in one list.
 *
 * The server's feed is preferred because it is the only one that knows about
 * both directions — a tip you received was never something this device did.
 * The local ledger is the fallback for a deployment that records no activity,
 * and is labelled as the partial thing it is.
 */
function ActivityList({
  activity,
  localEntries,
  locale,
}: {
  activity: ActivityEntry[] | null;
  localEntries: { id: string; label: string; luna: number; at: number }[];
  locale: string;
}) {
  const day = (at: number) =>
    new Date(at).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  if (activity === null) {
    return (
      <section className="mt-5">
        {localEntries.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {localEntries.slice(0, 30).map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-bold">{entry.label}</span>
                  <span className="block text-[0.6875rem] text-faint">{day(entry.at)}</span>
                </span>
                <span className="shrink-0 text-[0.9375rem] font-black text-accent-text tabular">
                  +{formatNim(entry.luna, { locale, maximumFractionDigits: 3 })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <PhaseNote className="mt-4">
          This deployment does not keep a server-side history, so this is only the
          rounds played on this device.
        </PhaseNote>
      </section>
    );
  }

  if (activity.length === 0) {
    return (
      <section className="mt-5">
        <Empty />
      </section>
    );
  }

  return (
    <section className="mt-5">
      <ul className="divide-y divide-line border-y border-line">
        {activity.map((entry) => {
          const incoming = entry.luna >= 0;
          return (
            <li key={entry.id} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.875rem] font-bold">
                  {KIND_LABEL[entry.kind] ?? 'Activity'}
                </span>
                <span className="block truncate text-[0.6875rem] text-faint">
                  {entry.label} · {day(entry.at)}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 text-[0.9375rem] font-black tabular',
                  incoming ? 'text-accent-text' : 'text-muted',
                )}
              >
                {incoming ? '+' : '−'}
                {formatNim(Math.abs(entry.luna), { locale, maximumFractionDigits: 3 })}
              </span>
            </li>
          );
        })}
      </ul>
      <PhaseNote className="mt-4">
        Everything that moved your balance, including tips sent and received. The
        figure above is what is left to withdraw.
      </PhaseNote>
    </section>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl bg-panel-2 px-5 py-10 text-center">
      <p className="text-[0.9375rem] font-bold">Nothing yet</p>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[0.8125rem] leading-relaxed text-muted">
        Play a game in the Arcade, check in daily, or get tipped — it all lands here.
      </p>
    </div>
  );
}
