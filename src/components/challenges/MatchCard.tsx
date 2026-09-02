'use client';

import Link from 'next/link';
import { useState } from 'react';

import { StateChip } from '@/components/challenges/StateChip';
import { ChevronRightIcon } from '@/components/shell/icons';
import { Button } from '@/components/ui/Button';
import { PlayerFace } from '@/components/ui/PlayerFace';
import { cn } from '@/components/ui/cn';
import { ApiError, challengeAction } from '@/lib/api/client';
import { formatById } from '@/lib/challenges/types';
import { hasFunded, pot, type Challenge, type Side } from '@/lib/escrow/types';
import { shortenAddress } from '@/lib/nimiq/address';
import { formatNim } from '@/lib/nimiq/units';

/**
 * One of the player's matches, with whatever it needs from them next.
 *
 * A list of rows that only link somewhere is fine for browsing and wrong for
 * a match in progress: the thing a player wants after finishing a game is to
 * say who won and be paid, and making them open a detail screen to find that
 * is a step for no reason. So the action that moves this match along lives on
 * the card itself, and the card says plainly what it is waiting for when the
 * next move is not theirs.
 */
export function MatchCard({
  challenge,
  mySide,
  address,
  onChanged,
}: {
  challenge: Challenge;
  mySide: Side;
  address: string | null;
  onChanged: (challenge: Challenge) => void;
}) {
  const [busy, setBusy] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);

  const opponent = mySide === 'host' ? challenge.guest : challenge.host;
  const me = mySide === 'host' ? challenge.host : challenge.guest;
  const them = opponent?.username ? `@${opponent.username}` : opponent ? shortenAddress(opponent.address) : 'your opponent';
  const title = challenge.title?.trim() || formatById(challenge.format).name;

  async function report(winner: Side) {
    if (!address || busy) return;
    setBusy(winner);
    setError(null);
    try {
      onChanged(await challengeAction(address, challenge.id, 'report', { winner }));
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Could not send your result.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-2xl bg-panel-2 p-4">
      <div className="flex items-start gap-3">
        {opponent && <PlayerFace address={opponent.address} size={38} />}
        <div className="min-w-0 flex-1">
          <Link href={`/challenges/${challenge.id}`} className="block active:opacity-60">
            <p className="truncate text-[1rem] font-black tracking-tight">{title}</p>
            <p className="mt-0.5 truncate text-[0.75rem] text-faint">vs {them}</p>
          </Link>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[1rem] font-black tabular">
            {challenge.currency === 'NIM' ? formatNim(pot(challenge)) : (pot(challenge) / 100).toFixed(2)}
            <span className="ml-1 text-[0.625rem] text-faint">{challenge.currency}</span>
          </p>
          <div className="mt-1">
            <StateChip state={challenge.state} />
          </div>
        </div>
      </div>

      <div className="mt-3.5 border-t border-line pt-3.5">
        <NextStep
          challenge={challenge}
          mySide={mySide}
          them={them}
          busy={busy}
          onReport={report}
          reported={me?.reported}
        />
        {error && (
          <p role="alert" className="mt-2.5 text-[0.75rem] font-semibold text-negative">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

/** What this match is waiting for, and the one control that moves it. */
function NextStep({
  challenge,
  mySide,
  them,
  busy,
  reported,
  onReport,
}: {
  challenge: Challenge;
  mySide: Side;
  them: string;
  busy: Side | null;
  reported?: Side;
  onReport: (winner: Side) => void;
}) {
  const theirSide: Side = mySide === 'host' ? 'guest' : 'host';

  if (challenge.state === 'open') {
    return (
      <Waiting>
        {mySide === 'host' ? `Waiting for ${them} to accept.` : 'Open this to accept it.'}
      </Waiting>
    );
  }

  if (challenge.state === 'accepted' || challenge.state === 'partly_funded') {
    if (!hasFunded(challenge, mySide)) {
      return (
        <Link
          href={`/challenges/${challenge.id}`}
          className="flex min-h-11 items-center justify-between rounded-xl bg-accent px-4 text-[0.875rem] font-black text-on-accent active:scale-[0.99]"
        >
          Send your stake
          <ChevronRightIcon className="size-4" />
        </Link>
      );
    }
    return <Waiting>Your stake is in. Waiting for {them} to put theirs up.</Waiting>;
  }

  // The match has been played. This is the moment the whole thing exists for.
  if (challenge.state === 'funded' || challenge.state === 'reported') {
    if (reported) {
      return (
        <Waiting>
          You said {reported === mySide ? 'you' : them} won. Waiting for {them} to report.
        </Waiting>
      );
    }
    return (
      <div>
        <p className="mb-2.5 text-[0.8125rem] font-bold">Who won?</p>
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="contrast" loading={busy === mySide} onClick={() => onReport(mySide)}>
            I won
          </Button>
          <Button variant="outline" loading={busy === theirSide} onClick={() => onReport(theirSide)}>
            {them} won
          </Button>
        </div>
        <p className="mt-2 text-[0.6875rem] leading-snug text-faint">
          The pot pays out automatically as soon as you both say the same thing.
        </p>
      </div>
    );
  }

  if (challenge.state === 'disputed') {
    return (
      <p className="text-[0.8125rem] leading-relaxed text-negative">
        Your reports do not match, so nothing has been paid. This one needs sorting out
        between you.
      </p>
    );
  }

  if (challenge.state === 'settled') {
    const won = challenge.winner === mySide;
    return (
      <p className={cn('text-[0.8125rem] font-bold', won ? 'text-positive' : 'text-muted')}>
        {won
          ? `You won ${formatNim(pot(challenge))} ${challenge.currency}. It has been sent to your wallet.`
          : `${them} won. The pot went to them.`}
      </p>
    );
  }

  return null;
}

function Waiting({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.8125rem] leading-relaxed text-muted">{children}</p>;
}
