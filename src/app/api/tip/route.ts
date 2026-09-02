import { NextResponse } from 'next/server';

import { shortenAddress } from '@/lib/nimiq/address';
import { recordActivity } from '@/lib/server/activity';
import { verifySignedRequest } from '@/lib/server/auth';
import { hasDurableStore } from '@/lib/server/env';
import { lookupAddress, lookupUsername } from '@/lib/server/players';
import { tip } from '@/lib/server/rewards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tip another player by username.
 *
 * Signed, unlike crediting a round: this one moves value *away* from the
 * caller, so the server has to know the caller really is who they say. The
 * amount and the sender both come from the verified request, never from a
 * field the client could choose independently of its signature.
 *
 * The transfer is between reward ledgers, not on chain — see `tip()` in
 * lib/server/rewards.ts for why that is the right shape for this.
 */
export async function POST(request: Request) {
  if (!hasDurableStore) {
    return NextResponse.json({ error: 'Tipping is not configured on this deployment.' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const luna = Number(body.luna);

  // The intent binds the signature to this exact tip, so a signature captured
  // for a small tip cannot be replayed as a large one, or aimed elsewhere.
  const auth = verifySignedRequest(body as never, `tip:${username.toLowerCase()}:${luna}`);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const recipient = await lookupUsername(username);
  if (!recipient) {
    return NextResponse.json({ error: `No player called @${username}.` }, { status: 404 });
  }

  const result = await tip(auth.address, recipient.address, luna);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // Both sides get a line. The recipient's is the whole point: without it,
  // being tipped is a number silently changing, with nothing to say why.
  const sender = await lookupAddress(auth.address);
  await Promise.all([
    recordActivity(auth.address, {
      kind: 'tip-out',
      luna: -result.sent,
      label: `@${recipient.username}`,
      href: '/wallet?tab=tip',
    }),
    recordActivity(recipient.address, {
      kind: 'tip-in',
      luna: result.sent,
      label: sender?.username ? `@${sender.username}` : shortenAddress(auth.address),
      href: '/wallet',
    }),
  ]);

  return NextResponse.json({
    sent: result.sent,
    balance: result.balance,
    username: recipient.username,
  });
}
