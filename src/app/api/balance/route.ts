import { NextResponse } from 'next/server';

import { isNimiqAddressShape } from '@/lib/nimiq/address';
import { hasRpc } from '@/lib/server/env';
import { accountBalance } from '@/lib/server/rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read an address's on-chain NIM balance.
 *
 * The Mini App provider has no balance method, and its RPC routing would mean
 * the browser talking to a node directly — which for a node behind
 * credentials means shipping those credentials to every player's phone in a
 * `NEXT_PUBLIC_` variable. Anyone reading the bundle would then have the
 * node's login.
 *
 * So the read happens here instead, where `NIMIQ_RPC_URL` and `NIMIQ_RPC_AUTH`
 * stay server-side, and the client only ever sees a number back.
 */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address') ?? '';
  if (!isNimiqAddressShape(address)) {
    return NextResponse.json({ error: 'A valid Nimiq address is required.' }, { status: 400 });
  }
  if (!hasRpc) {
    return NextResponse.json({ error: 'No Nimiq node is configured on this deployment.' }, { status: 503 });
  }

  try {
    const balance = await accountBalance(address);
    return NextResponse.json({ balance });
  } catch {
    // An unreachable node is not the player's problem to decode.
    return NextResponse.json({ error: 'Could not reach the Nimiq node.' }, { status: 502 });
  }
}
