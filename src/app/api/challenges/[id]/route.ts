import { NextResponse } from 'next/server';

import { verifySignedRequest } from '@/lib/server/auth';
import {
  acceptChallenge,
  confirmFunding,
  readChallenge,
  reportResult,
} from '@/lib/server/challenges';
import { hasDurableStore, hasTreasury } from '@/lib/server/env';
import { lookupAddress } from '@/lib/server/players';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// reportResult() settles by calling payout(), which now waits for on-chain
// confirmation before resolving — give it the same headroom as /api/withdraw
// so a platform timeout can never cut a settlement off mid-poll.
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!hasDurableStore) {
    return NextResponse.json({ error: 'Escrow is not configured.' }, { status: 503 });
  }
  const { id } = await params;
  const challenge = await readChallenge(id);
  if (!challenge) return NextResponse.json({ error: 'No such challenge.' }, { status: 404 });
  return NextResponse.json({ challenge });
}

/**
 * Move a challenge along: accept it, confirm a stake landed, or report a
 * result. Every action is authorised by a signature over that specific intent,
 * so a signature captured for one cannot be replayed as another.
 */
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
  if (action !== 'accept' && action !== 'confirm-funding' && action !== 'report') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const auth = verifySignedRequest(body as never, `${action}:${id}`);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  if (action === 'accept') {
    const me = await lookupAddress(auth.address);
    const result = await acceptChallenge(id, auth.address, me?.username);
    return result.ok
      ? NextResponse.json({ challenge: result.value })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (action === 'confirm-funding') {
    const result = await confirmFunding(id, auth.address);
    return result.ok
      ? NextResponse.json({ challenge: result.value })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  const winner = body.winner;
  if (winner !== 'host' && winner !== 'guest') {
    return NextResponse.json({ error: 'Winner must be host or guest.' }, { status: 400 });
  }
  const result = await reportResult(id, auth.address, winner);
  return result.ok
    ? NextResponse.json({ challenge: result.value })
    : NextResponse.json({ error: result.error }, { status: result.status });
}
