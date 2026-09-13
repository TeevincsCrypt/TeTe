import { NextResponse } from 'next/server';

import { verifySignedRequest } from '@/lib/server/auth';
import { cancelBracket, joinBracket, kickFromBracket, readBracket } from '@/lib/server/brackets';
import { hasDurableStore, hasTreasury } from '@/lib/server/env';
import { lookupAddress } from '@/lib/server/players';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!hasDurableStore) {
    return NextResponse.json({ error: 'Escrow is not configured.' }, { status: 503 });
  }
  const { id } = await params;
  const bracket = await readBracket(id);
  if (!bracket) return NextResponse.json({ error: 'No such tournament.' }, { status: 404 });
  return NextResponse.json({ bracket });
}

/** Join or cancel this tournament — the only two actions a bracket takes directly. */
export async function POST(request: Request, { params }: Params) {
  if (!hasDurableStore || !hasTreasury) {
    return NextResponse.json({ error: 'Escrow is not configured.' }, { status: 503 });
  }

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const action = body.action;
  if (action !== 'join' && action !== 'cancel' && action !== 'kick') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  if (action === 'kick') {
    const target = typeof body.target === 'string' ? body.target : null;
    if (!target) return NextResponse.json({ error: 'No player named to remove.' }, { status: 400 });

    // Scoped to the specific player being removed, not just the bracket, so
    // a captured signature cannot be replayed to remove someone else.
    const auth = verifySignedRequest(body as never, `kick-bracket:${id}:${target}`);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

    const result = await kickFromBracket(id, auth.address, target);
    return result.ok
      ? NextResponse.json({ bracket: result.value })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  const auth = verifySignedRequest(body as never, `${action}-bracket:${id}`);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  if (action === 'cancel') {
    const result = await cancelBracket(id, auth.address);
    return result.ok
      ? NextResponse.json({ bracket: result.value })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  const me = await lookupAddress(auth.address);
  const result = await joinBracket(id, auth.address, me?.username);
  return result.ok
    ? NextResponse.json({ bracket: result.value })
    : NextResponse.json({ error: result.error }, { status: result.status });
}
