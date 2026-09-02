import { NextResponse } from 'next/server';

import { readChallenge } from '@/lib/server/challenges';
import { hasDurableStore, hasTreasury, TREASURY_ADDRESS } from '@/lib/server/env';
import { accountBalance, transactionsFor, type RpcTransaction } from '@/lib/server/rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const compact = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : null;

function summarize(tx: RpcTransaction) {
  return {
    hash: typeof tx.hash === 'string' ? tx.hash : tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    confirmations: tx.confirmations,
    blockNumber: tx.blockNumber,
    timestamp: tx.timestamp,
    dataFields: {
      data: typeof tx.data,
      recipientData: typeof tx.recipientData,
      senderData: typeof tx.senderData,
    },
  };
}

/**
 * Which of one or more transaction lists a specific hash turns up in.
 *
 * A payout hash that the treasury's own history shows as sent, but that never
 * appears in the recipient's own history, is the direct evidence for "the
 * node knows what it broadcast but that is not the same as it reaching the
 * chain" — the one hypothesis worth checking with real data rather than
 * asserting from outside.
 */
function locate(hash: string | undefined, lists: Record<string, RpcTransaction[]>) {
  if (!hash) return null;
  const foundIn: Record<string, unknown> = {};
  for (const [name, list] of Object.entries(lists)) {
    const tx = list.find((t) => t.hash === hash);
    if (tx) foundIn[name] = summarize(tx);
  }
  return { hash, foundInAnyList: Object.keys(foundIn).length > 0, foundIn };
}

/**
 * What the server actually sees on chain for one challenge, from every angle
 * that could explain either "a paid stake is invisible" or "a payout says
 * sent but never arrived."
 *
 * Reads three transaction histories (treasury, host, guest) and two account
 * balances, rather than one, because a discrepancy between what the balance
 * shows and what the transaction list shows is itself the finding: it would
 * mean the chain state is correct and only the history index is unreliable.
 *
 * Read-only, and narrow: only transactions and balances for the treasury and
 * the two addresses already named in this challenge. Never a key, a
 * passphrase or a signature — all of this is public chain data anybody could
 * read from a node themselves.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('challenge') ?? '';
  if (!id) return NextResponse.json({ error: 'Pass ?challenge=<id>.' }, { status: 400 });
  if (!hasDurableStore || !hasTreasury) {
    return NextResponse.json({ error: 'Escrow is not configured here.' }, { status: 503 });
  }

  const challenge = await readChallenge(id);
  if (!challenge) return NextResponse.json({ error: 'No such challenge.' }, { status: 404 });

  const treasury = TREASURY_ADDRESS as string;
  const host = challenge.host.address;
  const guest = challenge.guest?.address;

  const errors: Record<string, string> = {};

  async function safeTx(address: string, label: string): Promise<RpcTransaction[]> {
    try {
      return await transactionsFor(address, 100);
    } catch (cause: unknown) {
      errors[label] = cause instanceof Error ? cause.message : 'RPC failed';
      return [];
    }
  }
  async function safeBalance(address: string, label: string): Promise<number | null> {
    try {
      return await accountBalance(address);
    } catch (cause: unknown) {
      errors[label] = cause instanceof Error ? cause.message : 'RPC failed';
      return null;
    }
  }

  const [treasuryTx, hostTx, guestTx, treasuryBalance, hostBalance, guestBalance] =
    await Promise.all([
      safeTx(treasury, 'treasuryTx'),
      safeTx(host, 'hostTx'),
      guest ? safeTx(guest, 'guestTx') : Promise.resolve([]),
      safeBalance(treasury, 'treasuryBalance'),
      safeBalance(host, 'hostBalance'),
      guest ? safeBalance(guest, 'guestBalance') : Promise.resolve(null),
    ]);

  if (treasuryTx.length === 0 && hostTx.length === 0 && Object.keys(errors).length > 0) {
    return NextResponse.json({ reachedNode: false, errors });
  }

  const wanted = { treasury: compact(treasury), host: compact(host), guest: compact(guest) };
  const annotate = (tx: RpcTransaction) => ({
    ...summarize(tx),
    fromCompact: compact(tx.from),
    toCompact: compact(tx.to),
    toMatchesTreasury: compact(tx.to) === wanted.treasury,
    fromMatchesHost: compact(tx.from) === wanted.host,
    fromMatchesGuest: compact(tx.from) === wanted.guest,
    valueClearsStake: typeof tx.value === 'number' && tx.value >= challenge.stake,
  });

  const lists = { treasuryTx, hostTx, guestTx };

  return NextResponse.json({
    reachedNode: true,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    challenge: {
      id: challenge.id,
      state: challenge.state,
      stakeLuna: challenge.stake,
      createdAt: challenge.createdAt,
      escrowAddress: challenge.escrowAddress,
      host: { address: host, fundingTx: challenge.host.fundingTx, refundTx: challenge.host.refundTx },
      guest: guest
        ? { address: guest, fundingTx: challenge.guest?.fundingTx, refundTx: challenge.guest?.refundTx }
        : null,
      payoutTx: challenge.payoutTx,
      winner: challenge.winner,
    },
    // The real on-chain balances right now. Compare these to what the stakes
    // and any recorded payout/refund imply — a mismatch here is proof the
    // problem is in the node's history index, not in the money itself.
    balances: {
      treasury: treasuryBalance,
      host: hostBalance,
      guest: guestBalance,
    },
    // Every hash this challenge has recorded, and exactly which of the three
    // histories (if any) actually contains it.
    recordedTransactions: {
      hostFundingTx: locate(challenge.host.fundingTx, lists),
      hostRefundTx: locate(challenge.host.refundTx, lists),
      guestFundingTx: locate(challenge.guest?.fundingTx, lists),
      guestRefundTx: locate(challenge.guest?.refundTx, lists),
      payoutTx: locate(challenge.payoutTx, lists),
    },
    counts: {
      treasuryTx: treasuryTx.length,
      hostTx: hostTx.length,
      guestTx: guestTx.length,
    },
    // Full, unfiltered lists — the shape matters as much as the values: a
    // field arriving under a name or in a form the app did not expect is
    // exactly the class of bug this exists to catch.
    treasuryTx: treasuryTx.map(annotate),
    hostTx: hostTx.map(annotate),
    guestTx: guestTx.map(annotate),
    keys: {
      treasuryTx: treasuryTx[0] ? Object.keys(treasuryTx[0]) : [],
      hostTx: hostTx[0] ? Object.keys(hostTx[0]) : [],
      guestTx: guestTx[0] ? Object.keys(guestTx[0]) : [],
    },
  });
}
