import { NextResponse } from 'next/server';

import { CRON_SECRET, hasCron } from '@/lib/server/env';
import { payWeeklyPrizes } from '@/lib/server/leaderboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Pay last week's top 3 on the weekly leaderboard: 100, 50 and 30 NIM,
 * straight to their wallets. Triggered by Vercel Cron (see vercel.json),
 * which sends this exact bearer token automatically when CRON_SECRET is
 * set — nobody else can trigger a real treasury payout by hitting this URL.
 *
 * Idempotent: payWeeklyPrizes marks the week paid before sending anything,
 * so a duplicate or retried trigger for a week already paid does nothing.
 */
export async function GET(request: Request) {
  if (!hasCron) {
    return NextResponse.json({ error: 'Weekly prizes are not configured on this deployment.' }, { status: 503 });
  }

  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const result = await payWeeklyPrizes();
  return NextResponse.json(result);
}
