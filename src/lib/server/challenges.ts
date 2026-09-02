import 'server-only';

import {
  bothVoided,
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
import {
  explainMissingFunding,
  findFunding,
  payout,
  taggedStakes,
  treasuryHistory,
  verifyStakeByHash,
} from './treasury';
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
 * The transaction must reach the treasury, clear the stake, carry this
 * challenge's memo, and have enough confirmations. It is normally also
 * required to come from the caller's own registered address — but real
 * production evidence showed a stake land, correctly tagged and cleared,
 * from an address that was neither player's on file: Nimiq Pay's Mini App
 * bridge sends from whichever account is active in the wallet at signing
 * time, which is not guaranteed to be the account the player connected
 * with. So that check is relaxed here specifically, never in the passive
 * background reconciler — `address` is already proven to be this caller by
 * their signature before this function is even reached, which is what makes
 * it safe to credit them a deposit their own wallet was not the sender of.
 */
export async function confirmFunding(
  id: string,
  address: string,
  reportedHash?: string,
): Promise<Outcome<Challenge>> {
  const challenge = await readChallenge(id);
  if (!challenge) return fail('No such challenge.', 404);

  const side: Side | null =
    challenge.host.address === address ? 'host' : challenge.guest?.address === address ? 'guest' : null;
  if (!side) return fail('You are not in this challenge.', 403);

  const party = side === 'host' ? challenge.host : challenge.guest;
  if (!party) return fail('You are not in this challenge.', 403);
  if (party.fundingTx) return { ok: true, value: challenge };

  const otherParty = side === 'host' ? challenge.guest : challenge.host;
  const claimed = await claimedFundingHashes();

  // What the wallet handed back when this player paid. It is the surest
  // pointer to their payment that exists — the search below can only guess at
  // which deposit is theirs, while this names it — so it is tried first, and
  // then verified against the chain rather than believed.
  const tx =
    (reportedHash
      ? await verifyStakeByHash(reportedHash, id, challenge.stake, {
          claimed,
          escrowAddress: challenge.escrowAddress,
        })
      : null) ??
    (await findFunding(id, address, challenge.stake, {
      // Hashes already counted as somebody's stake, so an unmemoed payment
      // cannot be claimed twice.
      claimed,
      // Their stake cannot predate the challenge it is paying for.
      notBefore: challenge.createdAt,
      escrowAddress: challenge.escrowAddress,
      otherPartyAddress: otherParty?.address,
      allowUnmatchedSender: true,
    }));
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
 * Send the pot to one side and close the challenge.
 *
 * Paid first, recorded second, always — a failed send then leaves the
 * challenge payable rather than marked settled with nothing sent.
 */
async function payWinner(
  challenge: Challenge,
  winningSide: Side,
  resolvedBy?: Challenge['resolvedBy'],
): Promise<Outcome<Challenge>> {
  const target = winningSide === 'host' ? challenge.host : challenge.guest;
  if (!target) return fail('The winning player is missing.', 500);

  try {
    const hash = await payout(target.address, pot(challenge), `tete:payout:${challenge.id}`);
    challenge.winner = winningSide;
    challenge.payoutTx = hash;
    challenge.state = 'settled';
    if (resolvedBy) challenge.resolvedBy = resolvedBy;
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
 * Give every staked side its own stake back.
 *
 * Each refund goes to the address on the challenge, never to whoever the chain
 * says sent the money — a stake can arrive from any account the player's wallet
 * happened to be using, and paying that account back would send it somewhere
 * they never asked for. Whatever did come back is recorded even on failure, so
 * a retry cannot pay twice.
 */
async function refundStakes(challenge: Challenge, label: string): Promise<Outcome<true>> {
  for (const who of ['host', 'guest'] as const) {
    const party = who === 'host' ? challenge.host : challenge.guest;
    if (!party?.fundingTx || party.refundTx) continue;
    try {
      party.refundTx = await payout(party.address, challenge.stake, `tete:refund:${challenge.id}`);
      await recordActivity(party.address, {
        kind: 'payout',
        luna: challenge.stake,
        label: `${label}: ${challenge.title?.trim() || challenge.format}`,
        href: `/challenges/${challenge.id}`,
      });
    } catch (cause: unknown) {
      await save(challenge);
      return fail(
        cause instanceof Error
          ? `Could not refund the stakes: ${cause.message}`
          : 'Could not refund the stakes.',
        502,
      );
    }
  }
  return { ok: true, value: true };
}

/**
 * Report who won, and settle when both sides agree.
 *
 * Conflicting reports move to `disputed` and pay nobody: choosing a winner
 * from contradictory claims is the one decision that must not be automated.
 * But a dispute is not a dead end, and reporting stays open while one is
 * running — most disagreements are a mis-tap or two people meaning different
 * things by "the match", and either player changing their answer settles it
 * here and now. Changing your answer to your opponent's is conceding, and
 * concedes the pot with it; that is the player's own money to give.
 */
export async function reportResult(id: string, address: string, winner: Side): Promise<Outcome<Challenge>> {
  const challenge = await readChallenge(id);
  if (!challenge) return fail('No such challenge.', 404);
  if (
    challenge.state !== 'funded' &&
    challenge.state !== 'reported' &&
    challenge.state !== 'disputed'
  ) {
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
    challenge.disputedAt ??= Date.now();
    await save(challenge);
    return { ok: true, value: challenge };
  }
  if (outcome === 'pending') {
    await save(challenge);
    return { ok: true, value: challenge };
  }

  return payWinner(challenge, winner, challenge.state === 'disputed' ? 'agreement' : undefined);
}

/**
 * Offer to call a disputed match off, with both stakes going back.
 *
 * The way out when neither player will move and neither is obviously wrong —
 * a match that never finished, a disconnect, a genuine draw. It takes both
 * sides: one player asking is a proposal the other can accept by asking too,
 * and nothing moves until they have. A single side being able to void would
 * hand every loser a way out of losing.
 */
export async function voidDispute(id: string, address: string): Promise<Outcome<Challenge>> {
  const challenge = await readChallenge(id);
  if (!challenge) return fail('No such challenge.', 404);
  if (challenge.state !== 'disputed') {
    return fail(`Only a disputed challenge can be called off this way.`, 409);
  }

  const side: Side | null =
    challenge.host.address === address ? 'host' : challenge.guest?.address === address ? 'guest' : null;
  if (!side) return fail('You are not in this challenge.', 403);

  const party = side === 'host' ? challenge.host : challenge.guest;
  if (!party) return fail('You are not in this challenge.', 403);

  party.voidRequestedAt ??= Date.now();
  if (!bothVoided(challenge)) {
    // Waiting on the other side. Saved so they can see the offer standing.
    await save(challenge);
    return { ok: true, value: challenge };
  }

  const refunded = await refundStakes(challenge, 'Refund');
  if (!refunded.ok) return refunded;

  challenge.state = 'refunded';
  challenge.resolvedBy = 'void';
  await save(challenge);
  return { ok: true, value: challenge };
}

/**
 * The operator's decision on a dispute that the players could not end.
 *
 * Deliberately the only backstop, and deliberately not a timer. Releasing a
 * disputed pot back to both players after some deadline would be simpler and
 * is worse: whoever lost could dispute an honest result, wait, and get their
 * stake back every time, which costs nothing and makes reporting honestly
 * pointless. So a stuck dispute waits for a person — reachable only with the
 * admin token, never by a player.
 */
export async function resolveDispute(
  id: string,
  outcome: Side | 'void',
  note?: string,
): Promise<Outcome<Challenge>> {
  const challenge = await readChallenge(id);
  if (!challenge) return fail('No such challenge.', 404);
  if (challenge.state !== 'disputed') {
    return fail(`Only a disputed challenge needs resolving; this one is ${challenge.state}.`, 409);
  }

  if (note) challenge.resolutionNote = note;

  if (outcome === 'void') {
    const refunded = await refundStakes(challenge, 'Refund');
    if (!refunded.ok) return refunded;
    challenge.state = 'refunded';
    challenge.resolvedBy = 'operator';
    await save(challenge);
    return { ok: true, value: challenge };
  }

  return payWinner(challenge, outcome, 'operator');
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
 *
 * Two passes. The first requires the deposit to come from the player's own
 * registered address, same as always. The second allows a deposit from any
 * address, as long as it carries this challenge's memo — because a real case
 * had *both* players' stakes land from addresses neither had on file (Nimiq
 * Pay's Mini App bridge sends from whichever account is active at signing
 * time, not necessarily the one a player connected with), leaving 40 NIM
 * sitting correctly in escrow that nothing here would touch.
 *
 * Which of two memo-tagged deposits gets recorded against which side is then
 * arbitrary, and harmless: the memo already proves both belong to this
 * challenge, each hash can be claimed exactly once, and nothing downstream
 * reads the sender — a refund goes to the registered address that owes it and
 * a payout to the winner's, never to whoever the chain says paid.
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

  const attempt = async (side: Side, allowUnmatchedSender: boolean) => {
    const party = side === 'host' ? challenge.host : challenge.guest;
    if (!party || party.fundingTx) return;
    const otherParty = side === 'host' ? challenge.guest : challenge.host;

    claimed ??= await claimedFundingHashes();
    let tx;
    try {
      history ??= await treasuryHistory();
      tx = await findFunding(challenge.id, party.address, challenge.stake, {
        claimed,
        notBefore: challenge.createdAt,
        known: history,
        escrowAddress: challenge.escrowAddress,
        otherPartyAddress: otherParty?.address,
        allowUnmatchedSender,
      });
    } catch {
      // An unreachable node is not a reason to fail the read; the next poll
      // tries again.
      return;
    }
    if (!tx) return;

    party.fundingTx = tx.hash;
    party.fundedAt = Date.now();
    claimed.add(tx.hash);
    await claimFundingHash(tx.hash, challenge.id);
    changed = true;
  };

  for (const side of sides) {
    await attempt(side, false);
  }

  // Settling a deposit whose sender matches nobody is only safe while there
  // are enough of them to cover everyone still owing — see `taggedStakes`.
  const unfunded = sides.filter((side) => {
    const party = side === 'host' ? challenge.host : challenge.guest;
    return party && !party.fundingTx;
  });
  if (unfunded.length > 0) {
    try {
      claimed ??= await claimedFundingHashes();
      history ??= await treasuryHistory();
      const available = await taggedStakes(challenge.id, challenge.stake, {
        claimed,
        known: history,
        escrowAddress: challenge.escrowAddress,
      });
      if (available.length >= unfunded.length) {
        for (const side of unfunded) await attempt(side, true);
      }
    } catch {
      /* Unreachable node: the next read tries again. */
    }
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

  const refunded = await refundStakes(challenge, 'Refund');
  if (!refunded.ok) return refunded;

  challenge.state = 'refunded';
  challenge.cancelledBy = side;
  await save(challenge);
  return { ok: true, value: challenge };
}

const compact = (value: string) => value.replace(/\s+/g, '').toUpperCase();
