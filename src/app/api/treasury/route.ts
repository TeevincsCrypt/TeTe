import { NextResponse } from 'next/server';

import { TREASURY_ADDRESS, hasTreasury } from '@/lib/server/env';
import { accountBalance } from '@/lib/server/rpc';
import { MAX_DAILY_WITHDRAW_LUNA } from '@/lib/wallet/withdrawal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What the treasury holds, right now.
 *
 * Deliberately public, and deliberately separate from /api/diagnose/treasury.
 * That one is behind the admin token for two reasons: it takes an arbitrary
 * address and reports that player's internal reward balance, and it makes up
 * to a hundred RPC calls per request. Neither is true here. This is a single
 * call, and the only things it returns — the treasury's address and its
 * balance — are already readable by anyone with a block explorer, because
 * they are on a public chain. Gating them protects nothing and costs the
 * operator the ability to check their own float from a phone.
 *
 * It exists because gating the diagnostic took that ability away. Checking
 * the float after funding it is an ordinary thing to need, and it should not
 * require a bearer token, a terminal, or a redeploy.
 *
 * Nothing here can move money, and no key, passphrase, player address or
 * ledger balance is reachable through it.
 */

/** How long one reading is reused before the node is asked again. */
const CACHE_MS = 30_000;
let cached: { at: number; body: Record<string, unknown> } | null = null;

export async function GET() {
  if (!hasTreasury) {
    return NextResponse.json(
      { configured: false, error: 'No treasury is configured on this deployment.' },
      { status: 503 },
    );
  }

  // One shared reading per half-minute. A public endpoint that calls the node
  // on every request is an amplifier pointed at your own infrastructure, which
  // is the other reason the diagnostic is gated.
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json({ ...cached.body, cached: true });
  }

  const address = TREASURY_ADDRESS as string;
  let luna: number;
  try {
    luna = await accountBalance(address);
  } catch (cause: unknown) {
    return NextResponse.json(
      {
        configured: true,
        address,
        error: cause instanceof Error ? cause.message : 'The node did not answer.',
      },
      { status: 502 },
    );
  }

  const body = {
    configured: true,
    address,
    balanceLuna: luna,
    balanceNim: luna / 100_000,
    /**
     * The number that actually answers "how much runway is this?". Outflow is
     * bounded at the daily withdrawal cap per address, so this is how many
     * full days one player at the cap could be paid before the float is gone.
     */
    dailyWithdrawCapNim: MAX_DAILY_WITHDRAW_LUNA / 100_000,
    fullDailyWithdrawalsCovered: Math.floor(luna / MAX_DAILY_WITHDRAW_LUNA),
    checkedAt: new Date().toISOString(),
  };
  cached = { at: Date.now(), body };
  return NextResponse.json({ ...body, cached: false });
}
