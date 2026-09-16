import { NextResponse } from 'next/server';

import { recordActivity } from '@/lib/server/activity';
import { verifySignedRequest } from '@/lib/server/auth';
import { hasDurableStore, hasTreasury, withdrawalsPaused } from '@/lib/server/env';
import { releaseWithdrawal, reserveWithdrawal, rewardsBalanceKey } from '@/lib/server/rewards';
import { get, increment } from '@/lib/server/store';
import { payout } from '@/lib/server/treasury';
import { MAX_DAILY_WITHDRAW_LUNA, planWithdrawal } from '@/lib/wallet/withdrawal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pay out arcade rewards.
 *
 * The amount is NOT taken from the request. A client-supplied balance is a
 * client-supplied withdrawal limit, which is no limit at all — so the server
 * reads what it has credited, decides what may leave, and pays that. The
 * client's local ledger is a display copy, nothing more.
 *
 * Every step that guards money is atomic, and that is not a detail. This
 * route used to read the balance, read the day's withdrawals, decide both
 * left room, and only then write — four operations that concurrent requests
 * interleave freely. Fire N withdrawals at once from one address and all N
 * passed a check only one should have: the daily cap became N times the cap,
 * and the balance itself could be spent more than once. On serverless,
 * requests genuinely do run in parallel, so this was never an unlucky race.
 * It was the obvious way to attack this route, and the treasury was drained
 * through it.
 *
 * The shape that fixes it: take the money first, atomically, then read what
 * the atomic operation returned and stand down if it overshot. The loser of a
 * race always sees the winner's total. Nothing is decided from a value that
 * was read and acted on later.
 */
const balanceKey = rewardsBalanceKey;
const nim = (luna: number) => luna / 100_000;

export async function POST(request: Request) {
  if (!hasDurableStore || !hasTreasury) {
    return NextResponse.json(
      { error: 'Withdrawals are not configured on this deployment.' },
      { status: 503 },
    );
  }

  // A switch the operator can throw from Vercel without waiting on a code
  // change, for when something looks wrong and being slow costs money.
  if (withdrawalsPaused) {
    return NextResponse.json(
      { error: 'Withdrawals are paused while we check something. Your balance is safe.' },
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

  const key = balanceKey(auth.address);

  /*
   * This read sizes the attempt and produces the friendly refusals — below
   * the minimum, nothing to withdraw. It is deliberately NOT trusted as the
   * balance: by the time it is acted on, another request may have spent it.
   * Passing 0 for the day's total keeps the sizing to the per-withdrawal
   * ceiling; the real daily check is the atomic claim further down.
   */
  const owed = (await get<number>(key)) ?? 0;
  const plan = planWithdrawal(owed, 0);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 409 });
  const sending = plan.sending;

  // Debit first, atomically, and only then ask whether the debit was allowed.
  const remaining = await increment(key, -sending);
  if (remaining < 0) {
    await increment(key, sending);
    return NextResponse.json(
      { error: 'Another withdrawal is already in flight. Try again in a moment.' },
      { status: 409 },
    );
  }

  // Same shape for the daily allowance: claim it, then check the claim held.
  const claim = await reserveWithdrawal(auth.address, sending, MAX_DAILY_WITHDRAW_LUNA);
  if (!claim.ok) {
    await increment(key, sending);
    return NextResponse.json(
      {
        error:
          `You have withdrawn ${nim(claim.alreadyToday)} NIM today, and the daily limit is ` +
          `${nim(MAX_DAILY_WITHDRAW_LUNA)}. The rest stays on your balance — withdraw it tomorrow.`,
      },
      { status: 409 },
    );
  }

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
    // Give back exactly what was taken, in both places — the balance so it can
    // be withdrawn again, and the day's allowance so a failed send does not
    // count against it.
    await increment(key, sending);
    await releaseWithdrawal(auth.address, sending);
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'The payout failed.' },
      { status: 502 },
    );
  }
}
