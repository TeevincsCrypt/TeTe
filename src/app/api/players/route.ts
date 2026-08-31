import { NextResponse } from 'next/server';

import { verifySignedRequest } from '@/lib/server/auth';
import { hasDurableStore } from '@/lib/server/env';
import { claimUsername, lookupUsername } from '@/lib/server/players';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Look a player up by username, so a challenge can be addressed by name. */
export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get('u');
  if (!username) {
    return NextResponse.json({ error: 'Missing username.' }, { status: 400 });
  }
  if (!hasDurableStore) {
    return NextResponse.json(
      { error: 'The player directory is not configured on this deployment.' },
      { status: 503 },
    );
  }

  const player = await lookupUsername(username);
  if (!player) return NextResponse.json({ error: 'No player with that name.' }, { status: 404 });
  return NextResponse.json({ player: { username: player.username, address: player.address } });
}

/** Claim a username. Requires a signature proving control of the address. */
export async function POST(request: Request) {
  if (!hasDurableStore) {
    return NextResponse.json(
      { error: 'The player directory is not configured on this deployment.' },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const auth = verifySignedRequest(body as never, 'register');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const username = typeof body.username === 'string' ? body.username : '';
  const result = await claimUsername(username, auth.address);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ player: result.player });
}
