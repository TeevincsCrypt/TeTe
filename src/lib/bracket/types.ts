/**
 * Tournament brackets.
 *
 * A bracket is not a new escrow primitive — it is an orchestration layer on
 * top of the one that already exists. Every round of every bracket is a
 * completely ordinary Challenge: same funding verification, same reporting,
 * same disputes, same payout. All a bracket adds is *which* challenges get
 * created and in what order, by watching for a round's matches to settle and
 * pairing the winners into the next one. That is deliberate — it means a
 * bracket match cannot behave differently from a normal one in any way that
 * matters for money moving, because it is not a different code path for
 * money moving at all.
 */
import type { ChallengeFormatId } from '@/lib/challenges/types';
import type { StakeCurrency } from '@/types';

export const BRACKET_SIZES = [4, 8] as const;
export type BracketSize = (typeof BRACKET_SIZES)[number];

export type BracketState = 'open' | 'live' | 'complete' | 'cancelled';

export interface BracketEntrant {
  address: string;
  username?: string;
  joinedAt: number;
}

export interface BracketMatch {
  round: number;
  /** Index into `entrants` for each side of this match. */
  slotA: number;
  slotB: number;
  /** Set once the round is created — the real, fundable Challenge for it. */
  challengeId?: string;
  /** Index into `entrants` for whoever this match's challenge settled on. */
  winnerSlot?: number;
}

export interface Bracket {
  id: string;
  format: ChallengeFormatId;
  title?: string;
  currency: StakeCurrency;
  /** Stake per player, per match — same unit convention as Challenge.stake. */
  stake: number;
  size: BracketSize;
  state: BracketState;
  /** The player who started this tournament — the only one who can call it off. */
  hostAddress: string;
  /**
   * A private tournament never appears on the public open board — the only
   * way in is the direct link the host shares. Joining, seeding, funding,
   * disputes and payout are all otherwise identical to a public one.
   */
  private?: boolean;
  entrants: BracketEntrant[];
  matches: BracketMatch[];
  /** Index into `entrants`, once the final match has settled. */
  championSlot?: number;
  createdAt: number;
  updatedAt: number;
}

export function isFull(bracket: Bracket): boolean {
  return bracket.entrants.length >= bracket.size;
}

/** How many rounds a bracket of this size takes: 4 → 2, 8 → 3. */
export function roundCount(size: BracketSize): number {
  return Math.log2(size);
}

/**
 * Pair entrant indices into round-0 matchups, in the order given — callers
 * shuffle first if the pairing should be random. `size` entrants make
 * `size / 2` matches.
 */
export function pairRound0(size: BracketSize): { slotA: number; slotB: number }[] {
  const pairs: { slotA: number; slotB: number }[] = [];
  for (let i = 0; i < size; i += 2) {
    pairs.push({ slotA: i, slotB: i + 1 });
  }
  return pairs;
}

/** The matches belonging to one round, in slot order. */
export function matchesInRound(bracket: Bracket, round: number): BracketMatch[] {
  return bracket.matches.filter((match) => match.round === round);
}

/** Has every match in this round produced a winner? */
export function roundComplete(bracket: Bracket, round: number): boolean {
  const matches = matchesInRound(bracket, round);
  return matches.length > 0 && matches.every((match) => match.winnerSlot !== undefined);
}

/**
 * Who started this tournament, and so who may call it off or remove a player.
 *
 * `hostAddress` was added to the record after tournaments already existed, so
 * the ones created before it have none. Treating those as hostless locked
 * their own creators out of cancelling them permanently — which is worse than
 * the crash the guard was written to prevent.
 *
 * `entrants[0]` is the answer for those: createBracket seeds the entrant list
 * with the host and everyone else is pushed on after, so the first entrant is
 * the creator by construction. Client and server both read this, because a
 * button the UI offers and the API then refuses is its own kind of broken.
 */
export function bracketHost(bracket: Bracket): string | undefined {
  return bracket.hostAddress ?? bracket.entrants[0]?.address;
}

export const BRACKET_STATE_LABEL: Record<BracketState, string> = {
  open: 'Filling up',
  live: 'In progress',
  complete: 'Complete',
  cancelled: 'Cancelled',
};
