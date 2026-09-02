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
import { challengeAction, confirmSentStake, fetchChallenge, fundNimChallenge } from '@/lib/api/client';
import { readSentStake, type SentStake } from '@/lib/challenges/funding-record';
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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setChallenge(await fetchChallenge(id));
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
}: {
  challenge: Challenge;
  mySide: Side | null;
  address: string;
  busy: string | null;
  onRun: (label: string, action: () => Promise<Challenge>) => Promise<void>;
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
        busy={busy}
        onRun={onRun}
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
  busy,
  onRun,
}: {
  challenge: Challenge;
  address: string;
  busy: string | null;
  onRun: (label: string, action: () => Promise<Challenge>) => Promise<void>;
}) {
  const [sent, setSent] = useState<SentStake | null>(null);
  useEffect(() => {
    setSent(readSentStake(challenge.id));
    // `busy` changing means an attempt just started or finished; a finished
    // one may have cleared the record.
  }, [challenge.id, busy]);

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

  // A stake already sent from this device must never be sent again just
  // because confirmation was slow. While that record stands, the only thing
  // on offer is checking, not paying.
  const alreadySent = sent !== null;

  return (
    <Sticker tone="panel">
      <p className="text-[0.875rem] font-bold">
        {alreadySent ? 'Waiting for your stake to confirm' : 'Fund your stake'}
      </p>
      <p className="mt-1.5 text-[1.5rem] font-black tabular">
        {formatNim(challenge.stake)}
        <span className="ml-1.5 text-[0.8125rem] text-faint">NIM</span>
      </p>
      <p className="mt-3 text-[0.75rem] leading-relaxed text-faint">
        {alreadySent
          ? 'You have already sent this stake. It is on chain and nothing is lost — it just has not been confirmed yet. Check again in a moment.'
          : "Nimiq Pay will ask you to approve sending this to the escrow address, tagged with this challenge's reference so it is counted automatically."}
      </p>
      <Button
        className="mt-4"
        onClick={() =>
          onRun('fund', () =>
            alreadySent
              ? confirmSentStake(address, challenge.id)
              : fundNimChallenge(address, challenge),
          )
        }
        loading={busy === 'fund'}
      >
        {busy === 'fund'
          ? 'Confirming on chain…'
          : alreadySent
            ? 'Check for my payment'
            : 'Send stake'}
      </Button>
      {alreadySent && (
        <p className="mt-3 break-all font-mono text-[0.6875rem] text-faint">
          Sent: {sent.hash}
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
