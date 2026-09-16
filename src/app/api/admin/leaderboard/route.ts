import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { isNimiqAddressShape } from '@/lib/nimiq/address';
import { ADMIN_TOKEN, hasAdmin } from '@/lib/server/env';
import {
  removeFromLeaderboard,
  resetLeaderboard,
  type LeaderboardPeriod,
} from '@/lib/server/leaderboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Clear the current leaderboard, in whole or by address.
 *
 * Exists for the situation the leaderboard has no defence against on its
 * own: a farmed account (or several) at the top, drowning out real play. The
 * ranking has no way to tell a fabricated total from a real one by the
 * number alone, so nothing here tries to guess — it only clears what an
 * operator, having looked, decides needs clearing.
 *
 * Admin-gated for the same reason /api/admin/credit is: this changes what a
 * competitive ranking shows and can change who collects the automatic
 * weekly prize. It does NOT touch any reward balance — a reset only clears
 * where someone shows up on the board, never what they are owed — and it
 * does not touch a week that has already been paid out.
 *
 * The token is compared in constant time, same as the treasury diagnostic,
 * so a wrong guess does not reveal itself by how long it takes to fail.
 */
function authorized(request: Request): boolean {
  if (!hasAdmin) return false;
  const given = Buffer.from((request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(ADMIN_TOKEN as string);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function POST(request: Request) {
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Admin actions are not configured.' }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const periodInput = body.period;
  const periods: LeaderboardPeriod[] =
    periodInput === 'daily'
      ? ['daily']
      : periodInput === 'weekly'
        ? ['weekly']
        : periodInput === 'both' || periodInput === undefined
          ? ['daily', 'weekly']
          : [];
  if (periods.length === 0) {
    return NextResponse.json(
      { error: "period must be 'daily', 'weekly', or 'both' (default)." },
      { status: 400 },
    );
  }

  const address = typeof body.address === 'string' ? body.address : undefined;

  if (address !== undefined) {
    if (!isNimiqAddressShape(address)) {
      return NextResponse.json({ error: 'A valid Nimiq address is required.' }, { status: 400 });
    }
    await Promise.all(periods.map((period) => removeFromLeaderboard(period, address)));
    return NextResponse.json({ ok: true, action: 'removed', address, periods });
  }

  await Promise.all(periods.map((period) => resetLeaderboard(period)));
  return NextResponse.json({ ok: true, action: 'reset', periods });
}
