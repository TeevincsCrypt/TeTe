import { NextResponse } from 'next/server';

import { readChallenge } from '@/lib/server/challenges';
import { hasDurableStore, hasTreasury, TREASURY_ADDRESS } from '@/lib/server/env';
import { transactionsFor } from '@/lib/server/rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * What the server actually sees on chain for one challenge's stakes.
 *
 * Exists because guessing was not working: a stake was paid, the node had it,
 * and the matching still failed — and no amount of reading the code from the
 * outside settles which field or value is the mismatch. This shows the shape
 * of what the node returns next to what the challenge expects.
 *
 * Read-only, and deliberately narrow: only transactions involving the
 * treasury, only for the two addresses already named in the challenge, and
 * never a key, a passphrase or a signature. Everything here is public chain
 * data that anybody could read from a node themselves.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('challenge') ?? '';
  if (!id) return NextResponse.json({ error: 'Pass ?challenge=<id>.' }, { status: 400 });
  if (!hasDurableStore || !hasTreasury) {
    return NextResponse.json({ error: 'Escrow is not configured here.' }, { status: 503 });
  }

  const challenge = await readChallenge(id);
  if (!challenge) return NextResponse.json({ error: 'No such challenge.' }, { status: 404 });

  const compact = (value: unknown) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : null;

  let raw;
  try {
    raw = await transactionsFor(TREASURY_ADDRESS as string, 50);
  } catch (cause: unknown) {
    return NextResponse.json({
      reachedNode: false,
      error: cause instanceof Error ? cause.message : 'RPC failed',
    });
  }

  const treasury = compact(TREASURY_ADDRESS);
  const wanted = {
    host: compact(challenge.host.address),
    guest: compact(challenge.guest?.address),
  };

  return NextResponse.json({
    reachedNode: true,
    challenge: {
      id: challenge.id,
      state: challenge.state,
      stakeLuna: challenge.stake,
      createdAt: challenge.createdAt,
      escrowAddress: challenge.escrowAddress,
      hostFunded: Boolean(challenge.host.fundingTx),
      guestFunded: Boolean(challenge.guest?.fundingTx),
    },
    expect: { treasury, ...wanted },
    transactionCount: raw.length,
    // The shape matters as much as the values: a field arriving under a name
    // or in a form this did not expect is exactly the class of bug being hunted.
    transactions: raw.slice(0, 12).map((tx) => ({
      hash: typeof tx.hash === 'string' ? tx.hash.slice(0, 12) : tx.hash,
      from: tx.from,
      to: tx.to,
      fromCompact: compact(tx.from),
      toCompact: compact(tx.to),
      toMatchesTreasury: compact(tx.to) === treasury,
      fromMatchesHost: compact(tx.from) === wanted.host,
      fromMatchesGuest: compact(tx.from) === wanted.guest,
      value: tx.value,
      valueClearsStake: typeof tx.value === 'number' && tx.value >= challenge.stake,
      confirmations: tx.confirmations,
      timestamp: tx.timestamp,
      dataFields: {
        data: typeof tx.data,
        recipientData: typeof tx.recipientData,
        senderData: typeof tx.senderData,
      },
      recipientDataPreview:
        typeof tx.recipientData === 'string' ? tx.recipientData.slice(0, 80) : tx.recipientData,
    })),
    keys: raw[0] ? Object.keys(raw[0]) : [],
  });
}
