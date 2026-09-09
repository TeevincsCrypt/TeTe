/**
 * A player's real head-to-head record, computed from their own settled
 * challenges — never a placeholder, never a stored counter that can drift
 * out of sync with the challenges it is supposed to summarise.
 *
 * Only `settled` challenges count. A dispute that ends in a refund never
 * produced a winner, and anything still open, funded, or disputed has not
 * finished yet — counting either as "played" would credit or penalise a
 * result that was never actually decided.
 */
import type { Challenge, Side } from '@/lib/escrow/types';
import { compactAddress } from '@/lib/nimiq/address';

export interface Record {
  played: number;
  won: number;
  /** Null rather than 0 when nothing has settled yet — there is no rate to show. */
  winRate: number | null;
  bestStreak: number;
}

function sideFor(challenge: Challenge, address: string): Side | null {
  const compact = compactAddress(address);
  if (compactAddress(challenge.host.address) === compact) return 'host';
  if (challenge.guest && compactAddress(challenge.guest.address) === compact) return 'guest';
  return null;
}

/**
 * Ordered by `updatedAt`, which is when a settled challenge's last
 * transition happened — for a terminal state that is the settlement itself
 * — so the streak reads in the order the matches actually landed.
 */
export function computeRecord(challenges: Challenge[], address: string): Record {
  const settled = challenges
    .filter((challenge) => challenge.state === 'settled')
    .map((challenge) => ({ challenge, side: sideFor(challenge, address) }))
    .filter((entry): entry is { challenge: Challenge; side: Side } => entry.side !== null)
    .sort((a, b) => a.challenge.updatedAt - b.challenge.updatedAt);

  let won = 0;
  let streak = 0;
  let bestStreak = 0;
  for (const { challenge, side } of settled) {
    if (challenge.winner === side) {
      won += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  }

  const played = settled.length;
  return { played, won, winRate: played === 0 ? null : won / played, bestStreak };
}
