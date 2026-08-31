/**
 * The escrow state machine, shared by the client and the API.
 *
 * TeTe's escrow is **custodial**: both players send their stake to a treasury
 * address, and the treasury pays the winner. That is not the first choice —
 * a hashed-timelock contract would hold the funds trustlessly — but the Mini
 * App provider can only create basic transactions and staking ones, so it
 * cannot construct an HTLC on the player's behalf. Custody is the only shape
 * that works through the provider today, and saying so plainly matters: while
 * a challenge is funded, the operator holds the pot.
 *
 * Every transition below is guarded. The server is the only writer; the client
 * renders state and requests transitions.
 */
import type { ChallengeFormatId } from '@/lib/challenges/types';
import type { StakeCurrency } from '@/types';

export type EscrowState =
  /** Posted and waiting for someone to accept. Nothing funded. */
  | 'open'
  /** An opponent joined. Both sides now owe their stake. */
  | 'accepted'
  /** One side's stake is confirmed on chain, the other is outstanding. */
  | 'partly_funded'
  /** Both stakes confirmed. The match is live. */
  | 'funded'
  /** At least one result reported, still waiting for agreement. */
  | 'reported'
  /** Reports disagree. Held for resolution; nothing is paid automatically. */
  | 'disputed'
  /** Paid to the winner. Terminal. */
  | 'settled'
  /** Cancelled or expired before both sides funded. Refunds owed. */
  | 'refunded'
  /** Never funded and past its deadline. Terminal, nothing owed. */
  | 'expired';

export type Side = 'host' | 'guest';

export interface EscrowParty {
  address: string;
  username?: string;
  /**
   * When this player joined. A challenge aimed at a username carries its guest
   * from the start, so presence alone does not mean they have agreed — only
   * this does.
   */
  acceptedAt?: number;
  /** Hash of the funding transaction, once verified on chain. */
  fundingTx?: string;
  fundedAt?: number;
  /** Which side this player says won. */
  reported?: Side;
  reportedAt?: number;
}

export interface Challenge {
  id: string;
  state: EscrowState;
  format: ChallengeFormatId;
  title?: string;
  currency: StakeCurrency;
  /** Stake per player, in the currency's smallest unit (Luna for NIM). */
  stake: number;
  note?: string;
  host: EscrowParty;
  guest?: EscrowParty;
  /** Address both players fund. */
  escrowAddress?: string;
  /** Agreed winner, once both reports match. */
  winner?: Side;
  /** Hash of the payout transaction. */
  payoutTx?: string;
  createdAt: number;
  updatedAt: number;
  /** Unfunded challenges expire so a stale board does not accumulate. */
  expiresAt: number;
}

/** The pot, before fees. Both players stake the same. */
export function pot(challenge: Challenge): number {
  return challenge.stake * 2;
}

/** Has this side's stake been confirmed on chain? */
export function hasFunded(challenge: Challenge, side: Side): boolean {
  const party = side === 'host' ? challenge.host : challenge.guest;
  return Boolean(party?.fundingTx);
}

/** Which states still owe somebody their money back. */
export function owesRefund(state: EscrowState): boolean {
  return state === 'refunded' || state === 'disputed';
}

export const LIVE_STATES: readonly EscrowState[] = [
  'open', 'accepted', 'partly_funded', 'funded', 'reported', 'disputed',
];

export const TERMINAL_STATES: readonly EscrowState[] = ['settled', 'expired'];

/**
 * Legal transitions. Anything not listed is rejected, so a malformed or
 * replayed request cannot walk a challenge into a state that pays out.
 */
const TRANSITIONS: Record<EscrowState, readonly EscrowState[]> = {
  open: ['accepted', 'expired', 'refunded'],
  accepted: ['partly_funded', 'funded', 'refunded', 'expired'],
  partly_funded: ['funded', 'refunded'],
  funded: ['reported', 'disputed', 'refunded'],
  reported: ['settled', 'disputed', 'refunded'],
  disputed: ['settled', 'refunded'],
  settled: [],
  refunded: [],
  expired: [],
};

export function canTransition(from: EscrowState, to: EscrowState): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * State implied by funding progress. Kept in one place so the API and the UI
 * never disagree about what "funded" means.
 */
export function fundingState(challenge: Challenge): EscrowState {
  if (!challenge.guest?.acceptedAt) return 'open';
  const host = hasFunded(challenge, 'host');
  const guest = hasFunded(challenge, 'guest');
  if (host && guest) return 'funded';
  if (host || guest) return 'partly_funded';
  return 'accepted';
}

/**
 * Resolve reports into an outcome.
 *
 * Agreement settles. Disagreement disputes — deliberately never auto-resolved,
 * because picking a winner from conflicting claims is exactly the decision that
 * needs a human or an oracle, not a coin flip.
 */
export function resolveReports(challenge: Challenge): 'pending' | 'agreed' | 'conflict' {
  const a = challenge.host.reported;
  const b = challenge.guest?.reported;
  if (!a || !b) return 'pending';
  return a === b ? 'agreed' : 'conflict';
}

/** Human label for a state, used in both the list and the detail screens. */
export const STATE_LABEL: Record<EscrowState, string> = {
  open: 'Open',
  accepted: 'Awaiting stakes',
  partly_funded: 'One stake in',
  funded: 'Live',
  reported: 'Reporting',
  disputed: 'Disputed',
  settled: 'Settled',
  refunded: 'Refunded',
  expired: 'Expired',
};
