'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FormatArt } from '@/components/challenges/FormatArt';
import { StateChip } from '@/components/challenges/StateChip';
import { ChevronLeftIcon, CheckIcon } from '@/components/shell/icons';
import { PlayerFace } from '@/components/ui/PlayerFace';
import { Button } from '@/components/ui/Button';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { ConnectPanel } from '@/components/wallet/ConnectPanel';
import {
  challengeAction,
  fetchChallengeWithFunding,
  sendStake,
  signConfirmFunding,
  tryConfirmStake,
  type FundingView,
} from '@/lib/api/client';
import { clearSentStake, readSentStake, type SentStake } from '@/lib/challenges/funding-record';
import { formatById } from '@/lib/challenges/types';
import { copyText } from '@/lib/clipboard';
import { EXPLORER_TX_URL } from '@/lib/config/env';
import { fundingMemo, hasFunded, pot, type Challenge, type Side } from '@/lib/escrow/types';
import { compactAddress, shortenAddress } from '@/lib/nimiq/address';
import { formatNim } from '@/lib/nimiq/units';
import { useMiniApp } from '@/state/mini-app-provider';

const POLL_MS = 6_000;

export default function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { nimiq } = useMiniApp();

  const [challenge, setChallenge] = useState<Challenge | null | undefined>(undefined);
  const [funding, setFunding] = useState<FundingView>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchChallengeWithFunding(id);
      setChallenge(result?.challenge ?? null);
      setFunding(result?.funding ?? {});
    } catch {
      setChallenge(null);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function run(label: string, action: () => Promise<Challenge>) {
    setBusy(label);
    setError(null);
    try {
      setChallenge(await action());
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  if (challenge === undefined) {
    return <div className="pt-10 text-center text-[0.875rem] text-faint">Loading…</div>;
  }

  if (challenge === null) {
    return (
      <div className="pt-8">
        <Header onBack={() => router.push('/challenges')} />
        <h1 className="display mt-4 text-[1.75rem]">Challenge not found</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          It may have expired, or the link is wrong.
        </p>
      </div>
    );
  }

  const address = nimiq.address ? compactAddress(nimiq.address) : null;
  const mySide: Side | null =
    address && compactAddress(challenge.host.address) === address
      ? 'host'
      : address && challenge.guest && compactAddress(challenge.guest.address) === address
        ? 'guest'
        : null;

  const format = formatById(challenge.format);
  const title = challenge.title?.trim() || format.name;
  const opponent = mySide === 'host' ? challenge.guest : mySide === 'guest' ? challenge.host : undefined;

  return (
    <div className="pt-2">
      <Header onBack={() => router.push('/challenges')} />

      <div className="mt-4 overflow-hidden rounded-3xl bg-contrast">
        <FormatArt id={challenge.format} rounded="rounded-none" className="h-32 w-full" />
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <StateChip state={challenge.state} />
            <span className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-on-contrast/50">
              {opponent ? (
                <>
                  <PlayerFace address={opponent.address} size={18} className="border-0" />
                  vs {opponent.username ? `@${opponent.username}` : shortenAddress(opponent.address)}
                </>
              ) : mySide ? (
                'Waiting for an opponent'
              ) : (
                ''
              )}
            </span>
          </div>
          <h1 className="display mt-3 text-[1.75rem] text-on-contrast">{title}</h1>

          <div className="mt-5 border-t border-on-contrast/15 pt-4">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-on-contrast/50">
              Winner takes
            </p>
            <p className="mt-1 text-[2rem] font-black leading-none tracking-[-0.035em] tabular text-on-contrast">
              {challenge.currency === 'NIM' ? formatNim(pot(challenge)) : (pot(challenge) / 100).toFixed(2)}
              <span className="ml-2 text-[0.9375rem] text-on-contrast/55">{challenge.currency}</span>
            </p>
          </div>

          {challenge.note && (
            <p className="mt-4 rounded-xl bg-on-contrast/10 px-3.5 py-3 text-[0.8125rem] italic leading-snug text-on-contrast/75">
              “{challenge.note}”
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[0.8125rem] font-semibold text-negative">
          {error}
        </p>
      )}

      <div className="mt-5">
        {!nimiq.address ? (
          <ConnectPanel />
        ) : (
          <ChallengeAction
            challenge={challenge}
            mySide={mySide}
            address={nimiq.address}
            busy={busy}
            onRun={run}
            onConfirmed={setChallenge}
            funding={funding}
          />
        )}
      </div>

      {(challenge.state === 'settled' || challenge.state === 'disputed') && (
        <Sticker tone="panel" className="mt-4">
          <Eyebrow className="text-faint">Reports</Eyebrow>
          <ReportRow label="Host" side={challenge.host} />
          {challenge.guest && <ReportRow label="Guest" side={challenge.guest} />}
          {challenge.payoutTx && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="eyebrow text-faint">Payout transaction</p>
              <TxRef hash={challenge.payoutTx} />
            </div>
          )}
        </Sticker>
      )}
    </div>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to challenges"
        className="-ml-2 flex size-10 items-center justify-center rounded-full text-muted transition-colors active:text-text"
      >
        <ChevronLeftIcon className="size-5" />
      </button>
      <span className="text-[0.75rem] font-bold uppercase tracking-[0.1em] text-faint">Challenge</span>
    </header>
  );
}

function ReportRow({
  label,
  side,
}: {
  label: string;
  side: { username?: string; address: string; reported?: Side };
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[0.8125rem]">
      <span className="flex min-w-0 items-center gap-2 text-muted">
        <PlayerFace address={side.address} size={20} className="border" />
        <span className="truncate">
          {label}
          {side.username ? ` (@${side.username})` : ''}
        </span>
      </span>
      <span className="shrink-0 font-bold">
        {side.reported ? `Says ${side.reported} won` : 'No report yet'}
      </span>
    </div>
  );
}

function TxRef({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  const link = EXPLORER_TX_URL?.replace('{hash}', hash);

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <p className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-muted">{hash}</p>
      <button
        type="button"
        onClick={async () => setCopied(await copyText(hash))}
        className={`shrink-0 text-[0.6875rem] font-bold ${copied ? 'text-positive' : 'text-accent-text'}`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="shrink-0 text-[0.6875rem] font-bold text-accent-text">
          View
        </a>
      )}
    </div>
  );
}

/** The one action available for this player, given the challenge's state. */
function ChallengeAction({
  challenge,
  mySide,
  address,
  busy,
  onRun,
  onConfirmed,
  funding,
}: {
  challenge: Challenge;
  mySide: Side | null;
  address: string;
  busy: string | null;
  onRun: (label: string, action: () => Promise<Challenge>) => Promise<void>;
  onConfirmed: (challenge: Challenge) => void;
  funding: FundingView;
}) {
  const compact = compactAddress(address);

  // --- Open: needs an accept ------------------------------------------------
  if (challenge.state === 'open') {
    if (mySide === 'host') {
      return <ShareCard id={challenge.id} />;
    }
    if (challenge.guest && compactAddress(challenge.guest.address) !== compact) {
      return (
        <Sticker tone="panel">
          <p className="text-[0.875rem] leading-relaxed text-muted">
            This challenge was aimed at another player.
          </p>
        </Sticker>
      );
    }
    return (
      <Button
        onClick={() => onRun('accept', () => challengeAction(address, challenge.id, 'accept'))}
        loading={busy === 'accept'}
        size="lg"
      >
        Accept challenge
      </Button>
    );
  }

  if (!mySide) {
    return (
      <Sticker tone="panel">
        <p className="text-[0.875rem] leading-relaxed text-muted">
          This challenge is already underway between two other players.
        </p>
      </Sticker>
    );
  }

  // --- Funding ----------------------------------------------------------
  if (challenge.state === 'accepted' || challenge.state === 'partly_funded') {
    if (hasFunded(challenge, mySide)) {
      return (
        <Sticker tone="panel">
          <p className="text-[0.875rem] font-bold">Your stake is in</p>
          <p className="mt-1 text-[0.8125rem] text-muted">Waiting for the other side to fund.</p>
        </Sticker>
      );
    }
    return (
      <FundingCard
        challenge={challenge}
        address={address}
        onConfirmed={onConfirmed}
        chainSays={mySide === 'host' ? funding.host : funding.guest}
      />
    );
  }

  // --- Reporting ----------------------------------------------------------
  if (challenge.state === 'funded' || challenge.state === 'reported') {
    const me = mySide === 'host' ? challenge.host : challenge.guest;
    if (me?.reported) {
      return (
        <Sticker tone="panel">
          <p className="text-[0.875rem] font-bold">Report sent</p>
          <p className="mt-1 text-[0.8125rem] text-muted">
            You said {me.reported === mySide ? 'you' : 'they'} won. Waiting on the other report.
          </p>
        </Sticker>
      );
    }
    return (
      <div className="space-y-2.5">
        <p className="text-[0.8125rem] font-bold text-muted">Who won?</p>
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            variant="contrast"
            onClick={() => onRun('report-me', () => challengeAction(address, challenge.id, 'report', { winner: mySide }))}
            loading={busy === 'report-me'}
          >
            I won
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              onRun('report-them', () =>
                challengeAction(address, challenge.id, 'report', {
                  winner: mySide === 'host' ? 'guest' : 'host',
                }),
              )
            }
            loading={busy === 'report-them'}
          >
            They won
          </Button>
        </div>
        <PhaseNote>
          If your reports disagree, the challenge is held as disputed and nothing is paid
          automatically.
        </PhaseNote>
      </div>
    );
  }

  if (challenge.state === 'disputed') {
    return (
      <Sticker tone="panel">
        <p className="text-[0.875rem] font-bold text-negative">Disputed</p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          Your reports do not agree, so nothing has been paid. There is no automatic
          resolution built yet — this needs a human to look at it.
        </p>
      </Sticker>
    );
  }

  if (challenge.state === 'settled') {
    const won = challenge.winner === mySide;
    return (
      <Sticker tone={won ? 'accent' : 'panel'} className={won ? 'text-on-accent' : undefined}>
        <p className="text-[1.125rem] font-black">{won ? 'You won' : 'Settled'}</p>
        <p className={`mt-1 text-[0.8125rem] ${won ? 'text-on-accent/75' : 'text-muted'}`}>
          {won ? 'The pot has been sent to your wallet.' : 'The pot was paid to your opponent.'}
        </p>
      </Sticker>
    );
  }

  return null;
}

function FundingCard({
  challenge,
  address,
  onConfirmed,
  chainSays,
}: {
  challenge: Challenge;
  address: string;
  onConfirmed: (challenge: Challenge) => void;
  /** What the server can see of this stake on chain, when it is still missing. */
  chainSays?: string;
}) {
  const [sent, setSent] = useState<SentStake | null>(null);
  const [phase, setPhase] = useState<'idle' | 'approving' | 'confirming'>('idle');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only ever set once the server has actually found this on chain. Nimiq
  // Pay's own send call resolving with a string is not proof of that — its
  // own SDK documents the return value as "the serialized transaction," and
  // real cases have shown a resolved call with nothing ever reaching the
  // escrow. So "paid" is never claimed on the strength of that call alone.
  const [confirmed, setConfirmed] = useState(false);
  const [giveUp, setGiveUp] = useState(false);

  useEffect(() => {
    setSent(readSentStake(challenge.id));
  }, [challenge.id]);

  /**
   * Keep asking the server to find the payment, in the background.
   *
   * The signature is taken once and reused for the whole window — a wallet
   * dialog every few seconds was the previous version of this bug. Between
   * attempts the screen says what the chain is doing, because a spinner that
   * runs for two minutes is indistinguishable from a hang, and the money has
   * already left by then.
   */
  const confirming = useRef(false);
  const confirmLoop = useCallback(
    async (auth: Awaited<ReturnType<typeof signConfirmFunding>>) => {
      if (confirming.current) return;
      confirming.current = true;
      setPhase('confirming');
      setGiveUp(false);
      try {
        // Five minutes of patience, matching how long the signature is good
        // for — genuinely settling is worth waiting out. But this loop ending
        // without a match is real information, not just slowness, so it is
        // reported as such rather than papered over.
        for (let attempt = 0; attempt < 55; attempt += 1) {
          const result = await tryConfirmStake(challenge.id, auth);
          if (result.challenge) {
            setConfirmed(true);
            setNote(null);
            onConfirmed(result.challenge);
            return;
          }
          setNote(result.reason);
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        setGiveUp(true);
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Could not check for your payment.');
      } finally {
        confirming.current = false;
        setPhase('idle');
      }
    },
    [challenge.id, onConfirmed],
  );

  // No signing on mount. The server settles a landed stake by itself on every
  // read of this challenge, and this page already polls, so reopening the
  // screen is enough — raising a wallet dialog nobody asked for would be a
  // worse version of the problem this replaced.

  if (challenge.currency !== 'NIM') {
    return (
      <Sticker tone="panel">
        <p className="text-[0.875rem] font-bold">Fund with {challenge.currency}</p>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
          Automatic escrow only verifies NIM right now — watching for a {challenge.currency}
          {' '}transfer is not built. Agree NIM instead, or wait for that to ship.
        </p>
      </Sticker>
    );
  }

  async function send() {
    setError(null);
    setNote(null);
    setGiveUp(false);
    setPhase('approving');
    try {
      const hash = await sendStake(challenge);
      // Nimiq Pay's own send call has resolved — but its SDK documents that
      // return value as "the serialized transaction," not a hash, and this
      // exact call has been seen to resolve with nothing ever reaching the
      // escrow. So this is recorded (so a retry cannot double-pay if it
      // *was* real) without being announced as paid.
      setSent({ challengeId: challenge.id, hash, at: Date.now() });
      setNote('Nimiq Pay reports this was sent. Confirming with the network…');
      const auth = await signConfirmFunding(address, challenge.id);
      void confirmLoop(auth);
    } catch (cause: unknown) {
      setPhase('idle');
      setError(cause instanceof Error ? cause.message : 'Could not send your stake.');
    }
  }

  async function checkAgain() {
    setError(null);
    try {
      const auth = await signConfirmFunding(address, challenge.id);
      void confirmLoop(auth);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not check for your payment.');
    }
  }

  /**
   * Only for when nothing was ever confirmed. Clears the local record of a
   * send, so the button below goes back to offering to pay — this is safe
   * specifically because nothing here has ever been verified as real, so
   * there is nothing a retry could double.
   */
  function abandonAndRetry() {
    clearSentStake(challenge.id);
    setSent(null);
    setNote(null);
    setGiveUp(false);
  }

  // A record that something was sent is not proof it landed. Only a server
  // confirmation earns the word "paid".
  const attempted = sent !== null && !confirmed;

  return (
    <Sticker tone="panel">
      <p className="text-[0.875rem] font-bold">
        {attempted ? 'Confirming your stake' : 'Fund your stake'}
      </p>
      <p className="mt-1.5 text-[1.5rem] font-black tabular">
        {formatNim(challenge.stake)}
        <span className="ml-1.5 text-[0.8125rem] text-faint">NIM</span>
      </p>

      {attempted ? (
        <>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-panel-2 px-3 py-2.5">
            {phase === 'confirming' && !giveUp && (
              <span className="mt-0.5 size-3.5 shrink-0 animate-spin rounded-full border-2 border-faint border-t-transparent" />
            )}
            <p className="text-[0.75rem] leading-relaxed text-muted">
              {giveUp
                ? "This still has not shown up on chain. It may genuinely not have been sent — open Nimiq Pay's own transaction history and look for a payment to the address below. If it is not there, nothing has left your wallet."
                : 'Nimiq Pay reported this as sent. Waiting for it to actually appear on chain before counting it — a wallet reporting success is not the same as a payment landing.'}
            </p>
          </div>
          {(note ?? chainSays) && !giveUp && (
            <p className="mt-2.5 text-[0.75rem] leading-relaxed text-faint">{note ?? chainSays}</p>
          )}
          {giveUp && (
            <p className="mt-2.5 break-all font-mono text-[0.6875rem] text-faint">
              Escrow: {challenge.escrowAddress}
            </p>
          )}
          {phase !== 'confirming' && (
            <div className="mt-4 flex gap-2.5">
              <Button variant="outline" onClick={checkAgain}>
                Check again
              </Button>
              {giveUp && (
                <Button variant="contrast" onClick={abandonAndRetry}>
                  Nothing was sent — retry
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mt-3 text-[0.75rem] leading-relaxed text-faint">
            Nimiq Pay will ask you to approve sending this to the escrow address, tagged with
            this challenge&apos;s reference so it is counted automatically.
          </p>
          <Button className="mt-4" onClick={send} loading={phase === 'approving'}>
            {phase === 'approving' ? 'Approve in Nimiq Pay…' : 'Send stake'}
          </Button>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[0.75rem] font-semibold text-negative">
          {error}
        </p>
      )}

      {sent && (
        <p className="mt-3 break-all font-mono text-[0.6875rem] text-faint">
          {confirmed ? 'Confirmed: ' : 'Nimiq Pay reported: '}
          {sent.hash}
        </p>
      )}
      <p className="mt-3 break-all font-mono text-[0.6875rem] text-faint">
        Ref: {fundingMemo(challenge.id)}
      </p>
    </Sticker>
  );
}

function ShareCard({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const url = useRef<string>('');
  useEffect(() => {
    url.current = `${window.location.origin}/challenges/${id}`;
  }, [id]);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TeTe challenge', url: url.current });
        return;
      } catch {
        /* Dismissed — fall through to copying. */
      }
    }
    setCopied(await copyText(url.current));
  }

  return (
    <Sticker tone="panel">
      <p className="text-[0.875rem] font-bold">Waiting for someone to accept</p>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
        Share the link and the first person to open it can take it.
      </p>
      <Button className="mt-4" onClick={share}>
        {copied ? (
          <>
            <CheckIcon className="size-4" strokeWidth={3} /> Link copied
          </>
        ) : (
          'Share challenge link'
        )}
      </Button>
    </Sticker>
  );
}
