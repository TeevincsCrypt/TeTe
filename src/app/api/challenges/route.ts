import { NextResponse } from 'next/server';

import { createId } from '@/lib/ids';
import { verifySignedRequest } from '@/lib/server/auth';
import { challengesFor, createChallenge, openChallenges } from '@/lib/server/challenges';
import { hasDurableStore, hasTreasury } from '@/lib/server/env';
import { lookupAddress, lookupUsername } from '@/lib/server/players';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;

function unavailable() {
  return NextResponse.json(
    { error: 'Escrow is not configured on this deployment.' },
    { status: 503 },
  );
}

/** The open board, or one player's challenges. */
export async function GET(request: Request) {
  if (!hasDurableStore) return unavailable();
  const address = new URL(request.url).searchParams.get('address');
  const challenges = address ? await challengesFor(address) : await openChallenges();
  return NextResponse.json({ challenges });
}

/**
 * Post a challenge. Either open to the board, or aimed at a username — which
 * is resolved here, so the player never has to know anybody's address.
 */
export async function POST(request: Request) {
  if (!hasDurableStore || !hasTreasury) return unavailable();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const auth = verifySignedRequest(body as never, 'create-challenge');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const stake = Number(body.stake);
  if (!Number.isInteger(stake) || stake <= 0) {
    return NextResponse.json({ error: 'Stake must be a positive whole number.' }, { status: 400 });
  }

  let guest;
  if (typeof body.opponent === 'string' && body.opponent.trim()) {
    const found = await lookupUsername(body.opponent.trim());
    if (!found) {
      return NextResponse.json(
        { error: `No player called @${body.opponent}. They need to claim the name in TeTe first.` },
        { status: 404 },
      );
    }
    if (found.address === auth.address) {
      return NextResponse.json({ error: 'You cannot challenge yourself.' }, { status: 400 });
    }
    guest = { address: found.address, username: found.username };
  }

  const me = await lookupAddress(auth.address);

  const challenge = await createChallenge({
    id: createId(),
    format: (body.format as never) ?? 'custom',
    title: typeof body.title === 'string' ? body.title : undefined,
    currency: body.currency === 'USDT' ? 'USDT' : 'NIM',
    stake,
    note: typeof body.note === 'string' ? body.note : undefined,
    host: { address: auth.address, username: me?.username },
    guest,
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * DAY,
  });

  return NextResponse.json({ challenge });
}
