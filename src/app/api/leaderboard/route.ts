import { NextResponse } from 'next/server';

import { hasDurableStore } from '@/lib/server/env';
import { dailyKey, rankOf, topEntries, weeklyKey, type LeaderboardPeriod } from '@/lib/server/leaderboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Daily and weekly standings. Public, like the open challenge board and the
 * recent-wins feed — who is winning is not a secret.
 */
export async function GET(request: Request) {
  if (!hasDurableStore) {
    return NextResponse.json({ error: 'Escrow is not configured on this deployment.' }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const period: LeaderboardPeriod = params.get('period') === 'weekly' ? 'weekly' : 'daily';
  const key = period === 'weekly' ? weeklyKey() : dailyKey();
  const address = params.get('address');

  const entries = await topEntries(period, key, 10);
  const rank = address ? await rankOf(period, key, address) : null;
  return NextResponse.json({ period, key, entries, rank });
}
