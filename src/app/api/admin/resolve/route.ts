import { NextResponse } from 'next/server';

import { readChallenge, resolveDispute } from '@/lib/server/challenges';
import { ADMIN_TOKEN, hasAdmin } from '@/lib/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Awards the pot by calling payout(), which waits for the transaction to land.
export const maxDuration = 60;

/**
 * Decide a dispute the players could not end themselves.
 *
 * The last resort, and the only one: when two people insist on different
 * winners, someone outside the match has to look. A timer that released the
 * pot back to both after a while would need no operator at all and is exactly
 * why this is not that — a losing player could dispute every honest result,
 * wait it out, and never lose anything.
 *
 * Guarded by the same bearer token as the ledger correction endpoint, and for
 * a stronger reason: this one moves the treasury's money. It cannot invent a
 * payout, only choose between the two outcomes the challenge already allows —
 * the pot to one of its two players, or both stakes back — and only while the
 * challenge is genuinely disputed.
 *
 * GET ?challenge=<id> reads a dispute without changing it, so whoever is
 * deciding can see both claims and when they were made before they act.
 */
export async function GET(request: Request) {
  const unauthorized = guard(request);
  if (unauthorized) return unauthorized;

  const id = new URL(request.url).searchParams.get('challenge') ?? '';
  if (!id) return NextResponse.json({ error: 'Pass ?challenge=<id>.' }, { status: 400 });

  const challenge = await readChallenge(id);
  if (!challenge) return NextResponse.json({ error: 'No such challenge.' }, { status: 404 });

  return NextResponse.json({
    id: challenge.id,
    state: challenge.state,
    title: challenge.title,
    format: challenge.format,
    stake: challenge.stake,
    pot: challenge.stake * 2,
    disputedAt: challenge.disputedAt,
    host: {
      address: challenge.host.address,
      username: challenge.host.username,
      claims: challenge.host.reported,
      claimedAt: challenge.host.reportedAt,
      fundingTx: challenge.host.fundingTx,
      wantsVoid: Boolean(challenge.host.voidRequestedAt),
    },
    guest: challenge.guest
      ? {
          address: challenge.guest.address,
          username: challenge.guest.username,
          claims: challenge.guest.reported,
          claimedAt: challenge.guest.reportedAt,
          fundingTx: challenge.guest.fundingTx,
          wantsVoid: Boolean(challenge.guest.voidRequestedAt),
        }
      : null,
    resolvedBy: challenge.resolvedBy,
    resolutionNote: challenge.resolutionNote,
  });
}

export async function POST(request: Request) {
  const unauthorized = guard(request);
  if (unauthorized) return unauthorized;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const id = typeof body.challenge === 'string' ? body.challenge : '';
  if (!id) return NextResponse.json({ error: 'A challenge id is required.' }, { status: 400 });

  const outcome = body.outcome;
  if (outcome !== 'host' && outcome !== 'guest' && outcome !== 'void') {
    return NextResponse.json(
      { error: 'outcome must be "host", "guest" or "void".' },
      { status: 400 },
    );
  }

  // Shown to both players, so they are told why rather than just finding the
  // money moved.
  const note = typeof body.note === 'string' ? body.note.slice(0, 280) : undefined;

  const result = await resolveDispute(id, outcome, note);
  return result.ok
    ? NextResponse.json({ challenge: result.value })
    : NextResponse.json({ error: result.error }, { status: result.status });
}

function guard(request: Request): NextResponse | null {
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Dispute resolution is not configured.' }, { status: 503 });
  }
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  return null;
}
