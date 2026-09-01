import { NextResponse } from 'next/server';

import { verifySignedRequest } from '@/lib/server/auth';
import { hasDurableStore, hasTreasury } from '@/lib/server/env';
import { rewardsBalanceKey } from '@/lib/server/rewards';
import { get, set } from '@/lib/server/store';
import { payout } from '@/lib/server/treasury';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pay out arcade rewards.
 *
 * The amount is NOT taken from the request. A client-supplied balance is a
 * client-supplied withdrawal limit, which is no limit at all — so the server
 * reads what it has credited, pays that, and zeroes it. The client's local
 * ledger is a display copy, nothing more.
 *
 * Rewards are credited server-side as rounds are finished — see
 * /api/rewards — against the same key this reads, imported rather than
 * re-derived so the two can never disagree about whose balance is whose.
 */
const balanceKey = rewardsBalanceKey;
const MIN_LUNA = 25 * 100_000;

export async function POST(request: Request) {
  if (!hasDurableStore || !hasTreasury) {
    return NextResponse.json(
      { error: 'Withdrawals are not configured on this deployment.' },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const auth = verifySignedRequest(body as never, 'withdraw');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const owed = (await get<number>(balanceKey(auth.address))) ?? 0;
  if (owed < MIN_LUNA) {
    return NextResponse.json(
      { error: `You need at least ${MIN_LUNA / 100_000} NIM to withdraw. You have ${owed / 100_000}.` },
      { status: 409 },
    );
  }

  // Zero first: a double-spend is worse than a lost payout, and a failure here
  // leaves a recoverable record rather than a second transaction.
  await set(balanceKey(auth.address), 0);
  try {
    const hash = await payout(auth.address, owed, 'tete:rewards');
    return NextResponse.json({ sent: owed, transaction: hash });
  } catch (cause: unknown) {
    await set(balanceKey(auth.address), owed);
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'The payout failed.' },
      { status: 502 },
    );
  }
}
