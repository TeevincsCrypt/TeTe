import 'server-only';

import {
  canTransition,
  fundingMemo,
  fundingState,
  resolveReports,
  pot,
  type Challenge,
  type Side,
} from '@/lib/escrow/types';
import { recordActivity } from './activity';
import { TREASURY_ADDRESS } from './env';
import { explainMissingFunding, findFunding, payout, treasuryHistory } from './treasury';
import { get, list, push, set } from './store';

/**
 * Challenge persistence and the guarded transitions over it.
 *
 * The server is the only writer. Every mutation re-reads the stored record
 * first, so a stale client cannot overwrite state it has not seen, and every
 * state change goes through `canTransition` rather than being assigned.
 */
const key = (id: string) => `challenge:${id}`;
const OPEN_LIST = 'challenges:open';
const playerList = (address: string) => `challenges:player:${address.replace(/\s+/g, '')}`;
/** Transaction hashes already counted as somebody's stake. */
const CLAIMED_LIST = 'challenges:claimed-funding';

async function claimedFundingHashes(): Promise<Set<string>> {
  return new Set(await list(CLAIMED_LIST, 500));
}

async function claimFundingHash(hash: string, challengeId: string): Promise<void> {
  // The list is the guard; the pointer is for working out later which
  // challenge a given payment was counted against.
  await push(CLAIMED_LIST, hash);
  await set(`funding:claimed:${hash}`, challengeId);
}

export async function readChallenge(id: string): Promise<Challenge | null> {
  return get<Challenge>(key(id));
}

async function save(challenge: Challenge): Promise<Challenge> {
  challenge.updatedAt = Date.now();
  await set(key(challenge.id), challenge);
  return challenge;
}

export async function createChallenge(input: Omit<Challenge, 'state' | 'updatedAt' | 'escrowAddress'>): Promise<Challenge> {
  const challenge: Challenge = {
    ...input,
    state: 'open',
    escrowAddress: TREASURY_ADDRESS,
    updatedAt: Date.now(),
  };
  await save(challenge);
  await push(playerList(challenge.host.address), challenge.id);
  if (challenge.guest) {
    // A challenge aimed at somebody has to reach them. Indexing it under the
    // guest at creation — not only once they accept — is what puts it in front
    // of the player it names; without this the only route to it is a link the
    // host sends by hand, and being called out in the app does nothing at all.
    await push(playerList(challenge.guest.address), challenge.id);
  } else {
    await push(OPEN_LIST, challenge.id);
  }
  return challenge;
}

export async function openChallenges(limit = 40): Promise<Challenge[]> {
  const ids = await list(OPEN_LIST, limit);
  const found = await Promise.all(ids.map(readChallenge));
  return found.filter((c): c is Challenge => c !== null && c.state === 'open' && c.expiresAt > Date.now());
}

export async function challengesFor(address: string, limit = 40): Promise<Challenge[]> {
  const ids = await list(playerList(address), limit);
  const found = await Promise.all(ids.map(readChallenge));
  return found.filter((c): c is Challenge => c !== null);
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

const fail = (error: string, status = 400): Outcome<never> => ({ ok: false, error, status });

/** Join an open challenge. */
export async function acceptChallenge(id: string, address: string, username?: string): Promise<Outcome<Challenge>> {
  const challenge = await readChallenge(id);
  if (!challenge) return fail('No such challenge.', 404);
  if (challenge.host.address === address) return fail('You cannot accept your own challenge.');
  if (challenge.guest?.acceptedAt) return fail('Somebody already accepted this one.', 409);
  if (!canTransition(challenge.state, 'accepted')) return fail(`Cannot accept a challenge that is ${challenge.state}.`, 409);
  if (challenge.expiresAt < Date.now()) return fail('This challenge has expired.', 410);

  // A challenge aimed at a username may only be taken by that player; an open
  // one is first-come.
  if (challenge.guest && challenge.guest.address !== address) {
    return fail('This challenge was aimed at somebody else.', 403);
  }

  challenge.guest = {
    ...(challenge.guest ?? { address, username }),
    acceptedAt: Date.now(),
  };
  challenge.state = 'accepted';
  await save(challenge);
  await push(playerList(address), challenge.id);
  return { ok: true, value: challenge };
}

/**
 * Confirm a player's stake by finding it on chain.
 *
 * Nothing here trusts the caller: the transaction must exist, come from their
 * address, reach the treasury, clear the stake, carry this challenge's memo and
 * have enough confirmations. Anything less and the state does not move.
 */
export async function confirmFunding(id: string, address: string): Promise<Outcome<Challenge>> {
  const challenge = await readChallenge(id);
  if (!challenge) return fail('No such challenge.', 404);

  const side: Side | null =
    challenge.host.address === address ? 'host' : challenge.guest?.address === address ? 'guest' : null;
  if (!side) return fail('You are not in this challenge.', 403);

  const party = side === 'host' ? challenge.host : challenge.guest;
  if (!party) return fail('You are not in this challenge.', 403);
  if (party.fundingTx) return { ok: true, value: challenge };

  const tx = await findFunding(id, address, challenge.stake, {
    // Hashes already counted as somebody's stake, so an unmemoed payment
    // cannot be claimed twice.
    claimed: await claimedFundingHashes(),
    // Their stake cannot predate the challenge it is paying for.
    notBefore: challenge.createdAt,
    escrowAddress: challenge.escrowAddress,
  });
  if (!tx) {
    // Say which of the several very different reasons this is, so the player
    // knows whether to wait, to pay, or to come and ask.
    return fail(
      await explainMissingFunding(address, challenge.stake, undefined, challenge.escrowAddress),
      409,
    );
  }

  party.fundingTx = tx.hash;
  party.fundedAt = Date.now();
  await claimFundingHash(tx.hash, challenge.id);

  const next = fundingState(challenge);
  if (canTransition(challenge.state, next)) challenge.state = next;
  await save(challenge);
  return { ok: true, value: challenge };
}

/**
 * Report who won, and settle when both sides agree.
 *
 * Conflicting reports move to `disputed` and pay nobody. Choosing a winner
 * from contradictory claims is the one decision that must not be automated.
 */
export async function reportResult(id: string, address: string, winner: Side): Promise<Outcome<Challenge>> {
  const challenge = await readChallenge(id);
  if (!challenge) return fail('No such challenge.', 404);
  if (challenge.state !== 'funded' && challenge.state !== 'reported') {
    return fail(`Results cannot be reported while a challenge is ${challenge.state}.`, 409);
  }

  const side: Side | null =
    challenge.host.address === address ? 'host' : challenge.guest?.address === address ? 'guest' : null;
  if (!side) return fail('You are not in this challenge.', 403);

  const party = side === 'host' ? challenge.host : challenge.guest;
  if (!party) return fail('You are not in this challenge.', 403);
  party.reported = winner;
  party.reportedAt = Date.now();

  if (challenge.state === 'funded') challenge.state = 'reported';

  const outcome = resolveReports(challenge);
  if (outcome === 'conflict') {
    challenge.state = 'disputed';
    await save(challenge);
    return { ok: true, value: challenge };
  }
  if (outcome === 'pending') {
    await save(challenge);
    return { ok: true, value: challenge };
  }

  // Agreed. Pay the winner, then record it — in that order, so a failed send
  // leaves the challenge payable rather than marked settled with no money sent.
  const winningSide = winner;
  const target = winningSide === 'host' ? challenge.host : challenge.guest;
  if (!target) return fail('The winning player is missing.', 500);

  try {
    const hash = await payout(target.address, pot(challenge), `tete:payout:${challenge.id}`);
    challenge.winner = winningSide;
    challenge.payoutTx = hash;
    challenge.state = 'settled';
    await save(challenge);
    await recordActivity(target.address, {
      kind: 'payout',
      luna: pot(challenge),
      label: `Won: ${challenge.title?.trim() || challenge.format}`,
      href: `/challenges/${challenge.id}`,
    });
    return { ok: true, value: challenge };
  } catch (cause: unknown) {
    await save(challenge);
    return fail(cause instanceof Error ? cause.message : 'The payout failed.', 502);
  }
}


/**
 * Look for stakes that have landed but were never recorded.
 *
 * Whether a payment reached the escrow is an objective fact on a public
 * chain, not something needing the payer's permission to observe — and the
 * addresses checked come from the challenge itself, never from whoever is
 * asking. So this runs on an ordinary read, which means a stake settles into
 * the challenge on its own while the player watches, instead of only when
 * they hold the app open and approve another signature.
 *
 * That matters because the alternative failed exactly when it was needed: a
 * player who closed the screen mid-wait had paid, and nothing would ever
 * record it until they came back and asked again.
 */
export async function reconcileFunding(
  challenge: Challenge,
  known?: Awaited<ReturnType<typeof treasuryHistory>>,
): Promise<Challenge> {
  if (challenge.state !== 'accepted' && challenge.state !== 'partly_funded') return challenge;

  const sides: Side[] = ['host', 'guest'];
  let changed = false;
  let claimed: Set<string> | null = null;
  let history = known;

  for (const side of sides) {
    const party = side === 'host' ? challenge.host : challenge.guest;
    if (!party || party.fundingTx) continue;

    claimed ??= await claimedFundingHashes();
    let tx;
    try {
      history ??= await treasuryHistory();
      tx = await findFunding(challenge.id, party.address, challenge.stake, {
        claimed,
        notBefore: challenge.createdAt,
        known: history,
        escrowAddress: challenge.escrowAddress,
      });
    } catch {
      // An unreachable node is not a reason to fail the read; the next poll
      // tries again.
      return challenge;
    }
    if (!tx) continue;

    party.fundingTx = tx.hash;
    party.fundedAt = Date.now();
    claimed.add(tx.hash);
    await claimFundingHash(tx.hash, challenge.id);
    changed = true;
  }

  if (!changed) return challenge;

  const next = fundingState(challenge);
  if (canTransition(challenge.state, next)) challenge.state = next;
  return save(challenge);
}

/**
 * Call a challenge off, and give back anything already staked.
 *
 * Either player may do this while the match has not been played, because a
 * challenge nobody is going to play should not be able to sit on somebody's
 * money indefinitely — and a list you cannot clear is its own kind of trap.
 *
 * A stake that was recorded is refunded to the address that paid it, from the
 * treasury, before the challenge is closed. Refunds are attempted for both
 * sides and the state only moves once they have gone through, so a failure
 * leaves the challenge exactly as it was rather than closing it over money
 * that never came back.
 */
export async function cancelChallenge(id: string, address: string): Promise<Outcome<Challenge>> {
  const challenge = await readChallenge(id);
  if (!challenge) return fail('No such challenge.', 404);

  const side: Side | null =
    compact(challenge.host.address) === compact(address)
      ? 'host'
      : challenge.guest && compact(challenge.guest.address) === compact(address)
        ? 'guest'
        : null;
  if (!side) return fail('You are not in this challenge.', 403);

  if (!canTransition(challenge.state, 'refunded')) {
    return fail(`A challenge that is ${challenge.state} cannot be called off.`, 409);
  }
  // Once results are in, the pot belongs to whoever won it, not to whoever
  // asked first.
  if (challenge.host.reported || challenge.guest?.reported) {
    return fail('A result has already been reported. Settle it rather than calling it off.', 409);
  }

  for (const who of ['host', 'guest'] as const) {
    const party = who === 'host' ? challenge.host : challenge.guest;
    if (!party?.fundingTx || party.refundTx) continue;
    try {
      party.refundTx = await payout(party.address, challenge.stake, `tete:refund:${challenge.id}`);
      await recordActivity(party.address, {
        kind: 'payout',
        luna: challenge.stake,
        label: `Refund: ${challenge.title?.trim() || challenge.format}`,
        href: `/challenges/${challenge.id}`,
      });
    } catch (cause: unknown) {
      // Record whatever did come back, so a retry does not send it twice.
      await save(challenge);
      return fail(
        cause instanceof Error ? `Could not refund the stakes: ${cause.message}` : 'Could not refund the stakes.',
        502,
      );
    }
  }

  challenge.state = 'refunded';
  challenge.cancelledBy = side;
  await save(challenge);
  return { ok: true, value: challenge };
}

const compact = (value: string) => value.replace(/\s+/g, '').toUpperCase();
