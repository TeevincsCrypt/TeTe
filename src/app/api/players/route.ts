import { NextResponse } from 'next/server';

import { verifySignedRequest } from '@/lib/server/auth';
import { hasDurableStore } from '@/lib/server/env';
import { claimUsername, lookupAddress, lookupUsername } from '@/lib/server/players';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Look a player up — by username (`?u=`), so a challenge can be addressed by
 * name, or by address (`?address=`), which is how a player finds out which
 * name they themselves have claimed on a device that does not know yet.
 *
 * Both directions return the same public pair. Neither needs a signature: a
 * username and its address are exactly what players hand each other in order
 * to be challenged.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const username = params.get('u');
  const address = params.get('address');
  if (!username && !address) {
    return NextResponse.json({ error: 'Missing username or address.' }, { status: 400 });
  }
  if (!hasDurableStore) {
    return NextResponse.json(
      { error: 'The player directory is not configured on this deployment.' },
      { status: 503 },
    );
  }

  const player = username ? await lookupUsername(username) : await lookupAddress(address!);
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
