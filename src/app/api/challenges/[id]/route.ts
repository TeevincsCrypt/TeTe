import { NextResponse } from 'next/server';

import { verifySignedRequest } from '@/lib/server/auth';
import {
  acceptChallenge,
  cancelChallenge,
  confirmFunding,
  readChallenge,
  reconcileFunding,
  reportResult,
  voidDispute,
} from '@/lib/server/challenges';
import { hasDurableStore, hasTreasury } from '@/lib/server/env';
import { explainMissingFunding, treasuryHistory } from '@/lib/server/treasury';
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

  // Settle any stake that has landed since this was last looked at, so the
  // page's own polling is enough to show funding without the payer having to
  // sit on the screen and approve anything further.
  // One read of the treasury's history serves both settling and explaining,
  // rather than a fresh call to the node for each.
  let history;
  if (hasTreasury) {
    try {
      history = await treasuryHistory();
    } catch {
      /* Unreachable node: settle nothing, explain nothing, show the challenge. */
    }
  }
  const settled = history ? await reconcileFunding(challenge, history) : challenge;

  // When a side is still unfunded, say what the chain shows for them. A player
  // staring at "awaiting stakes" after paying needs to know which of several
  // very different situations they are in, and should not have to approve a
  // signature to be told.
  const funding: { host?: string; guest?: string } = {};
  if (history && (settled.state === 'accepted' || settled.state === 'partly_funded')) {
    if (!settled.host.fundingTx) {
      funding.host = await explainMissingFunding(
        settled.host.address,
        settled.stake,
        history,
        settled.escrowAddress,
      );
    }
    if (settled.guest && !settled.guest.fundingTx) {
      funding.guest = await explainMissingFunding(
        settled.guest.address,
        settled.stake,
        history,
        settled.escrowAddress,
      );
    }
  }

  return NextResponse.json({ challenge: settled, funding });
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
  if (
    action !== 'accept' &&
    action !== 'confirm-funding' &&
    action !== 'report' &&
    action !== 'cancel' &&
    action !== 'void'
  ) {
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

  if (action === 'cancel') {
    const result = await cancelChallenge(id, auth.address);
    return result.ok
      ? NextResponse.json({ challenge: result.value })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (action === 'void') {
    const result = await voidDispute(id, auth.address);
    return result.ok
      ? NextResponse.json({ challenge: result.value })
      : NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (action === 'confirm-funding') {
    // What the player's wallet reported when they paid. Only ever a pointer to
    // look the payment up by — every property that matters is then read off
    // the chain, so a wrong or invented hash finds nothing rather than
    // proving anything.
    const reportedHash = typeof body.hash === 'string' ? body.hash.slice(0, 128) : undefined;
    const result = await confirmFunding(id, auth.address, reportedHash);
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
