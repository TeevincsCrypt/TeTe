import 'server-only';

import { fundingMemo } from '@/lib/escrow/types';

import {
  MAX_PAYOUT_LUNA,
  TREASURY_ADDRESS,
  TREASURY_PASSPHRASE,
  hasDurableStore,
  hasTreasury,
} from './env';
import { rpc, transactionsFor, type RpcTransaction } from './rpc';

/**
 * Moving real money.
 *
 * Deposits are verified rather than trusted: a player claiming to have funded a
 * challenge proves nothing, so the server looks for a confirmed transaction to
 * the treasury address, from their address, for at least the stake, carrying
 * the challenge id. That last part is what stops one payment being claimed
 * against several challenges.
 *
 * Payouts are sent by the node holding the treasury wallet. Every guard below
 * exists because this is the code path that loses money if it is wrong.
 */
const MIN_CONFIRMATIONS = 3;

export class TreasuryError extends Error {}

function assertReady(): void {
  if (!hasTreasury) {
    throw new TreasuryError(
      'No treasury is configured. Set NIMIQ_RPC_URL, NIMIQ_TREASURY_ADDRESS and NIMIQ_TREASURY_PASSPHRASE.',
    );
  }
  if (!hasDurableStore) {
    // Without durable storage a payout cannot be recorded, so it could be
    // replayed after a cold start. Refusing is the only safe answer.
    throw new TreasuryError('Refusing to move funds without a durable store.');
  }
}

/**
 * Every readable form of a transaction's attached data.
 *
 * The wallet is handed a plain string and the node reports it back encoded,
 * under a field name that has moved between Albatross versions (`data`,
 * `recipientData`) and is sometimes wrapped in an object rather than being a
 * bare string. Guessing one shape and comparing for exact equality is how a
 * real stake went unrecognised: the payment was on chain and correct, and the
 * memo simply did not survive the round trip in the form this expected.
 *
 * So every candidate is collected, in both raw and hex-decoded form, and the
 * caller looks for the challenge id inside any of them.
 */
function memoCandidates(tx: RpcTransaction): string[] {
  const fields: unknown[] = [tx.data, tx.recipientData, tx.senderData];
  const out: string[] = [];

  for (const field of fields) {
    const raw =
      typeof field === 'string'
        ? field
        : typeof field === 'object' && field !== null
          ? // Some builds wrap it, e.g. { raw: "…" }.
            String((field as { raw?: unknown; data?: unknown }).raw ??
              (field as { data?: unknown }).data ??
              '')
          : '';
    if (!raw) continue;

    out.push(raw);
    if (/^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
      try {
        out.push(Buffer.from(raw, 'hex').toString('utf8'));
      } catch {
        /* Not really hex after all; the raw form is already recorded. */
      }
    }
  }
  return out;
}

/** Does this transaction carry the given challenge's reference anywhere? */
function carriesMemo(tx: RpcTransaction, challengeId: string): boolean {
  const memo = fundingMemo(challengeId);
  return memoCandidates(tx).some(
    (value) => value.includes(memo) || value.includes(challengeId),
  );
}

const compactAddr = (value: string) => value.replace(/\s+/g, '').toUpperCase();

/**
 * Payments from this address into the treasury that could fund a stake:
 * right recipient, right sender, enough value, enough confirmations.
 * Memo matching is applied by the caller, so it can fall back when the memo
 * did not survive the wallet's encoding.
 */
export async function paymentsFrom(
  fromAddress: string,
  minValue: number,
  known?: RpcTransaction[],
): Promise<RpcTransaction[]> {
  assertReady();
  const transactions = known ?? (await transactionsFor(TREASURY_ADDRESS as string, 200));
  return transactions.filter(
    (tx) =>
      compactAddr(tx.to) === compactAddr(TREASURY_ADDRESS as string) &&
      compactAddr(tx.from) === compactAddr(fromAddress) &&
      tx.value >= minValue &&
      (tx.confirmations ?? 0) >= MIN_CONFIRMATIONS,
  );
}

/**
 * Find the confirmed transaction that funds a challenge, or null.
 *
 * The memo is how one payment is tied to one challenge, so it is tried first.
 * `claimed` lets the caller pass the hashes already spent on other challenges,
 * which is what stops a single payment being counted twice when the memo is
 * unreadable and the fallback below has to be used instead.
 */
export async function findFunding(
  challengeId: string,
  fromAddress: string,
  minValue: number,
  options: { claimed?: Set<string>; notBefore?: number; known?: RpcTransaction[] } = {},
): Promise<RpcTransaction | null> {
  const candidates = (await paymentsFrom(fromAddress, minValue, options.known)).filter(
    (tx) => !options.claimed?.has(tx.hash),
  );

  const tagged = candidates.find((tx) => carriesMemo(tx, challengeId));
  if (tagged) return tagged;

  // No readable memo. A payment from exactly this player, to the treasury, for
  // at least this stake, made after the challenge existed and not already
  // counted against another challenge, is theirs — the memo was only ever the
  // means of telling two of their payments apart, and `claimed` does that job
  // here. Refusing on an unreadable memo would strand real money on chain.
  return (
    candidates.find((tx) => {
      if (!options.notBefore) return true;
      const at = txTimeMs(tx);
      // No usable timestamp is not evidence against it; only a confidently
      // older payment is. The slack matters: a block timestamp has
      // second granularity and is set by the network, so a stake paid moments
      // after a challenge was created can legitimately read as fractionally
      // older than it. This window is only meant to exclude payments from a
      // different session, not to referee seconds.
      return at === null || at >= options.notBefore - AGE_SLACK_MS;
    }) ?? null
  );
}

/** How far before a challenge a payment for it may appear to have been made. */
const AGE_SLACK_MS = 10 * 60 * 1000;

/**
 * The treasury's recent transactions, read once for a whole request.
 *
 * Settling two stakes and explaining two more used to mean four separate
 * calls to the node for the same list, on every poll, from every player
 * watching. A small self-hosted node feels that, and a slow node is
 * indistinguishable from a broken one to whoever is waiting on it.
 */
export function treasuryHistory(max = 200): Promise<RpcTransaction[]> {
  assertReady();
  return transactionsFor(TREASURY_ADDRESS as string, max);
}

/**
 * Why a stake could not be found, in a sentence a player can act on.
 *
 * "No confirmed payment found yet" is true and useless: it cannot tell apart a
 * transaction still being mined, a node that has not indexed it, and a payment
 * that never happened. Those need completely different responses from the
 * person reading it, so the difference is worth the extra look at the chain.
 */
export async function explainMissingFunding(
  fromAddress: string,
  minValue: number,
  known?: RpcTransaction[],
): Promise<string> {
  try {
    const all = known ?? (await transactionsFor(TREASURY_ADDRESS as string, 200));
    const mine = all.filter(
      (tx) =>
        compactAddr(tx.to) === compactAddr(TREASURY_ADDRESS as string) &&
        compactAddr(tx.from) === compactAddr(fromAddress),
    );

    if (mine.length === 0) {
      return 'The node cannot see any payment from your address to the escrow yet. It may still be spreading through the network.';
    }

    const enough = mine.filter((tx) => tx.value >= minValue);
    if (enough.length === 0) {
      const best = Math.max(...mine.map((tx) => tx.value));
      return `A payment from you reached the escrow, but for ${best / 100_000} NIM — less than the stake.`;
    }

    const confirmed = enough.filter((tx) => (tx.confirmations ?? 0) >= MIN_CONFIRMATIONS);
    if (confirmed.length === 0) {
      const best = Math.max(...enough.map((tx) => tx.confirmations ?? 0));
      return `Your payment has arrived and is waiting to settle (${best} of ${MIN_CONFIRMATIONS} confirmations).`;
    }

    return 'Your payment is on chain but has already been counted against another challenge.';
  } catch {
    return 'The node could not be reached to check. Your payment is not lost — try again shortly.';
  }
}

/**
 * A transaction's time in milliseconds, or null when it cannot be read.
 * Albatross has reported this in both seconds and milliseconds, so the
 * magnitude decides rather than an assumption.
 */
function txTimeMs(tx: RpcTransaction): number | null {
  const value = tx.timestamp;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value < 1e12 ? value * 1000 : value;
}

/**
 * Wait for a sent transaction to actually land, rather than trusting the hash
 * the send returned.
 *
 * A hash back from `sendBasicTransactionWithData` proves the node accepted the
 * transaction syntactically — not that it was ever included in a block. A
 * transaction with an expired validity window is accepted the same way and
 * then silently dropped, which is exactly what happened here before the fix
 * above: the caller saw a hash and reported success while no NIM ever moved.
 * So a payout is not treated as real until it is found on chain.
 */
async function waitForOnChain(hash: string, address: string): Promise<void> {
  const attempts = 10;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const transactions = await transactionsFor(address, 20);
    const found = transactions.find((tx) => tx.hash === hash);
    if (found && (found.confirmations ?? 0) >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new TreasuryError(
    'The payout was submitted but never confirmed on chain. Nothing was recorded as sent.',
  );
}

/**
 * Send from the treasury. Resolves only once the transaction is confirmed on
 * chain — not merely accepted by the node — so a caller can trust that
 * resolving means the NIM actually moved.
 *
 * The wallet is unlocked for a few seconds only — long enough for this send,
 * short enough that an idle node is not left able to spend.
 */
export async function payout(recipient: string, luna: number, memo: string): Promise<string> {
  assertReady();

  if (!Number.isInteger(luna) || luna <= 0) {
    throw new TreasuryError('Payout amount must be a positive whole number of Luna.');
  }
  if (luna > MAX_PAYOUT_LUNA) {
    throw new TreasuryError('Payout exceeds the configured ceiling.');
  }

  await rpc('unlockAccount', [TREASURY_ADDRESS, TREASURY_PASSPHRASE, 10]);
  const hash = await rpc<string>('sendBasicTransactionWithData', [
    TREASURY_ADDRESS,
    recipient,
    Buffer.from(memo, 'utf8').toString('hex'),
    luna,
    0,
    // A plain number here deserializes as ValidityStartHeight::Absolute(n) —
    // literally block n. Passing 0 built a transaction whose validity window
    // was block 0, expired by tens of millions of blocks on a live chain, so
    // it was accepted into the mempool and then dropped. A string prefixed
    // with "+" deserializes as Relative(n): "n blocks from now", which for
    // n=0 is exactly "start the window at the current block" — the only
    // value that is ever correct for a payout sent in real time.
    '+0',
  ]);
  await waitForOnChain(hash, TREASURY_ADDRESS as string);
  return hash;
}
