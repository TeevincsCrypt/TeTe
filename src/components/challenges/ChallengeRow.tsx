import Link from 'next/link';

import { FormatArt } from '@/components/challenges/FormatArt';
import { StateChip } from '@/components/challenges/StateChip';
import { Avatar } from '@/components/ui/Avatar';
import { formatById } from '@/lib/challenges/types';
import { pot, type Challenge, type Side } from '@/lib/escrow/types';
import { formatNim } from '@/lib/nimiq/units';

/** One row in a challenge list — the board, or the player's own. */
export function ChallengeRow({
  challenge,
  mySide,
}: {
  challenge: Challenge;
  /** This player's role in it, when they have one. */
  mySide?: Side | null;
}) {
  const opponent = mySide === 'host' ? challenge.guest : mySide === 'guest' ? challenge.host : undefined;
  // Whoever this row is "about" to the person reading it: their opponent, or
  // the player a challenge they are looking at was aimed at.
  const face = opponent ?? challenge.guest;

  return (
    <Link
      href={`/challenges/${challenge.id}`}
      className="flex items-center gap-3.5 py-3.5 active:opacity-60"
    >
      <FormatArt id={challenge.format} className="size-12 shrink-0" rounded="rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-black tracking-tight">
          {challenge.title?.trim() || formatById(challenge.format).name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {face && <Avatar address={face.address} size={16} className="border" />}
          <p className="truncate text-[0.75rem] text-faint">
            {opponent
              ? `vs ${opponent.username ? `@${opponent.username}` : 'opponent'}`
              : challenge.guest
                ? `Aimed at @${challenge.guest.username ?? 'a player'}`
                : 'Open to anyone'}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[0.9375rem] font-black tabular">
          {challenge.currency === 'NIM' ? formatNim(pot(challenge)) : (pot(challenge) / 100).toFixed(2)}
          <span className="ml-1 text-[0.625rem] text-faint">{challenge.currency}</span>
        </p>
        <div className="mt-1">
          <StateChip state={challenge.state} />
        </div>
      </div>
    </Link>
  );
}
