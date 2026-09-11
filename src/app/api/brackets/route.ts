import { NextResponse } from 'next/server';

import { BRACKET_SIZES } from '@/lib/bracket/types';
import { createId } from '@/lib/ids';
import { verifySignedRequest } from '@/lib/server/auth';
import { bracketsFor, createBracket, listOpenBrackets } from '@/lib/server/brackets';
import { hasDurableStore, hasTreasury } from '@/lib/server/env';
import { lookupAddress } from '@/lib/server/players';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable() {
  return NextResponse.json(
    { error: 'Escrow is not configured on this deployment.' },
    { status: 503 },
  );
}

/** The open tournament board, or one player's tournaments. */
export async function GET(request: Request) {
  if (!hasDurableStore) return unavailable();
  const params = new URL(request.url).searchParams;
  const address = params.get('address');
  const brackets = address ? await bracketsFor(address) : await listOpenBrackets();
  return NextResponse.json({ brackets });
}

/** Start a tournament, entering yourself as its first player. */
export async function POST(request: Request) {
  if (!hasDurableStore || !hasTreasury) return unavailable();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const auth = verifySignedRequest(body as never, 'create-bracket');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const size = Number(body.size);
  if (!(BRACKET_SIZES as readonly number[]).includes(size)) {
    return NextResponse.json({ error: 'A tournament is 4 or 8 players.' }, { status: 400 });
  }

  const stake = Number(body.stake);
  if (!Number.isInteger(stake) || stake <= 0) {
    return NextResponse.json({ error: 'Stake must be a positive whole number.' }, { status: 400 });
  }

  const me = await lookupAddress(auth.address);

  const bracket = await createBracket({
    id: createId(),
    format: (body.format as never) ?? 'custom',
    title: typeof body.title === 'string' ? body.title : undefined,
    currency: body.currency === 'USDT' ? 'USDT' : 'NIM',
    stake,
    size: size as never,
    host: { address: auth.address, username: me?.username },
  });

  return NextResponse.json({ bracket });
}
