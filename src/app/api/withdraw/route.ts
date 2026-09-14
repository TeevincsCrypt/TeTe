import { NextResponse } from 'next/server';

import { recordActivity } from '@/lib/server/activity';
import { verifySignedRequest } from '@/lib/server/auth';
import { hasDurableStore, hasTreasury } from '@/lib/server/env';
import { noteWithdrawal, rewardsBalanceKey, withdrawnToday } from '@/lib/server/rewards';
import { get, set } from '@/lib/server/store';
import { payout } from '@/lib/server/treasury';
import { planWithdrawal } from '@/lib/wallet/withdrawal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pay out arcade rewards.
 *
 * The amount is NOT taken from the request. A client-supplied balance is a
 * client-supplied withdrawal limit, which is no limit at all — so the server
 * reads what it has credited, decides what may leave today, and pays that.
 * The client's local ledger is a display copy, nothing more.
 *
 * Rewards are credited server-side as rounds are finished — see
 * /api/rewards — against the same key this reads, imported rather than
 * re-derived so the two can never disagree about whose balance is whose.
 *
 * Earning is uncapped by design: play all day and keep what you earn. That
 * makes this the only place bounding what the treasury pays out in a day, so
 * every request passes through `planWithdrawal`. Hitting the ceiling costs
 * nothing — the unpaid remainder stays on the ledger for tomorrow.
 */
const balanceKey = rewardsBalanceKey;

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
  const plan = planWithdrawal(owed, await withdrawnToday(auth.address));
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 409 });
  const { sending, remaining } = plan;

  // Debit and book the withdrawal before sending: a double-spend is worse
  // than a lost payout, and a failure here leaves a recoverable record rather
  // than a second transaction.
  await set(balanceKey(auth.address), remaining);
  await noteWithdrawal(auth.address, sending);
  try {
    const hash = await payout(auth.address, sending, 'tete:rewards');
    await recordActivity(auth.address, {
      kind: 'withdrawal',
      luna: -sending,
      label: 'Withdrawn to your wallet',
      href: '/wallet?tab=withdraw',
    });
    return NextResponse.json({ sent: sending, remaining, transaction: hash });
  } catch (cause: unknown) {
    // Restore exactly what was taken, in both places — the balance so it can
    // be withdrawn again, and the day's allowance so a failed send does not
    // count against it.
    await set(balanceKey(auth.address), remaining + sending);
    await noteWithdrawal(auth.address, -sending);
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'The payout failed.' },
      { status: 502 },
    );
  }
}
