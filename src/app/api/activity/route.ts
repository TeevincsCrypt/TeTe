import { NextResponse } from 'next/server';

import { isNimiqAddressShape } from '@/lib/nimiq/address';
import { readActivity } from '@/lib/server/activity';
import { hasDurableStore } from '@/lib/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * An address's balance history, as the server recorded it.
 *
 * Public, like the balance itself: it says what moved, never anything that
 * could move money. It is a GET so any device the player opens shows the same
 * history — including the half of it their own phone never did, such as a tip
 * somebody else sent them.
 */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address') ?? '';
  if (!isNimiqAddressShape(address)) {
    return NextResponse.json({ error: 'A valid Nimiq address is required.' }, { status: 400 });
  }
  if (!hasDurableStore) {
    return NextResponse.json({ error: 'Activity is not recorded on this deployment.' }, { status: 503 });
  }

  return NextResponse.json({ entries: await readActivity(address) });
}
