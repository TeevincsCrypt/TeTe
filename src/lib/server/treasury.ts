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

function memoOf(tx: RpcTransaction): string {
  const raw = tx.data ?? tx.recipientData ?? '';
  if (!raw) return '';
  try {
    // Nimiq carries transaction data as hex; fall back to the raw string.
    return /^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0
      ? Buffer.from(raw, 'hex').toString('utf8')
      : raw;
  } catch {
    return raw;
  }
}

/**
 * Find the confirmed transaction that funds a challenge, or null.
 * Amount, sender, recipient, memo and confirmations must all line up.
 */
export async function findFunding(
  challengeId: string,
  fromAddress: string,
  minValue: number,
): Promise<RpcTransaction | null> {
  assertReady();
  const memo = fundingMemo(challengeId);
  const compact = (value: string) => value.replace(/\s+/g, '').toUpperCase();

  const transactions = await transactionsFor(TREASURY_ADDRESS as string, 200);
  return (
    transactions.find(
      (tx) =>
        compact(tx.to) === compact(TREASURY_ADDRESS as string) &&
        compact(tx.from) === compact(fromAddress) &&
        tx.value >= minValue &&
        memoOf(tx).trim() === memo &&
        (tx.confirmations ?? 0) >= MIN_CONFIRMATIONS,
    ) ?? null
  );
}

/**
 * Send from the treasury. Returns the transaction hash.
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
  return rpc<string>('sendBasicTransactionWithData', [
    TREASURY_ADDRESS,
    recipient,
    Buffer.from(memo, 'utf8').toString('hex'),
    luna,
    0,
    0,
  ]);
}
