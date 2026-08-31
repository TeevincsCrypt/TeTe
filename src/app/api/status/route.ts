import { NextResponse } from 'next/server';

import { hasDurableStore, hasTreasury } from '@/lib/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What this deployment can actually do.
 *
 * The two capabilities are configured separately and fail separately, so the
 * client has to be able to tell them apart:
 *
 *   store  — a durable store is set up. The username directory works and
 *            challenge lists can be read.
 *   escrow — the treasury is set up on top of that, so challenges can be
 *            posted, funded and settled with real money.
 *
 * Reading challenges needs only the store, but posting one needs both. Without
 * this endpoint the client could only probe the read path, conclude the backend
 * was up, offer "Post challenge", and then fail on a 503 the moment it was
 * pressed. Naming the two separately is what stops the UI promising something
 * the server cannot do.
 *
 * Only booleans are exposed — never the URLs, addresses or tokens behind them.
 */
export async function GET() {
  return NextResponse.json({
    store: hasDurableStore,
    escrow: hasDurableStore && hasTreasury,
  });
}
