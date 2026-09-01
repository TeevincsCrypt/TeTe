import { NextResponse } from 'next/server';

import { GAMES, type GameId } from '@/lib/arcade/games';
import { verifySignedRequest } from '@/lib/server/auth';
import { hasDurableStore } from '@/lib/server/env';
import { creditGameReward } from '@/lib/server/rewards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GAME_IDS = new Set<string>(GAMES.map((game) => game.id));

/**
 * Credit a finished arcade round to the player's withdrawable balance.
 *
 * Only the store is required, not the treasury — crediting the ledger and
 * paying it out are separate steps (see /api/withdraw), same as escrow
 * separates posting a challenge from settling it.
 */
export async function POST(request: Request) {
  if (!hasDurableStore) {
    return NextResponse.json({ error: 'Rewards are not configured on this deployment.' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const auth = verifySignedRequest(body as never, 'reward');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const gameId = typeof body.gameId === 'string' ? body.gameId : '';
  if (!GAME_IDS.has(gameId)) {
    return NextResponse.json({ error: 'Unknown game.' }, { status: 400 });
  }

  const result = await creditGameReward(auth.address, gameId as GameId, Number(body.score));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ credited: result.credited, balance: result.balance });
}
