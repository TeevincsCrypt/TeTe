import { NextResponse } from 'next/server';

import { GAMES, type GameId } from '@/lib/arcade/games';
import { isNimiqAddressShape } from '@/lib/nimiq/address';
import { hasDurableStore } from '@/lib/server/env';
import { creditGameReward } from '@/lib/server/rewards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GAME_IDS = new Set<string>(GAMES.map((game) => game.id));

/**
 * Credit a finished arcade round to the player's withdrawable balance.
 *
 * Deliberately unsigned. Rewards land the moment a round ends, and requiring
 * a signature would mean Nimiq Pay raising a native dialog after every single
 * game — which the rest of this app is careful never to do without a
 * deliberate tap.
 *
 * That is safe because a signature here would not be what protects the money:
 * crediting only moves a number in a ledger, and /api/withdraw — the step that
 * actually sends NIM — still demands a signature proving control of the
 * address. So the worst an unsigned credit can do is inflate a ledger that
 * only its rightful owner can ever draw from, within the caps in
 * lib/server/rewards.ts. The real cost is griefing: anyone can burn a known
 * address's daily allowance. Bounded, and worth the trade for not prompting
 * a wallet dialog every round.
 *
 * Only the store is required, not the treasury — crediting the ledger and
 * paying it out are separate steps, the same way escrow separates posting a
 * challenge from settling it.
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

  const address = typeof body.address === 'string' ? body.address : '';
  if (!isNimiqAddressShape(address)) {
    return NextResponse.json({ error: 'A valid Nimiq address is required.' }, { status: 400 });
  }

  const gameId = typeof body.gameId === 'string' ? body.gameId : '';
  if (!GAME_IDS.has(gameId)) {
    return NextResponse.json({ error: 'Unknown game.' }, { status: 400 });
  }

  const result = await creditGameReward(
    address,
    gameId as GameId,
    Number(body.score),
    Number(body.coins ?? 0),
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ credited: result.credited, balance: result.balance });
}
