import { NextResponse } from 'next/server';

import { isNimiqAddressShape } from '@/lib/nimiq/address';
import { ADMIN_TOKEN, MAX_PAYOUT_LUNA, hasAdmin } from '@/lib/server/env';
import { rewardsBalanceKey } from '@/lib/server/rewards';
import { get, push, set } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Manually correct a reward ledger balance.
 *
 * Exists for exactly one situation: a bug on the payout path can zero a
 * player's ledger without ever paying them (see the validityStartHeight fix
 * this shipped alongside — a payout reported success and the ledger was
 * zeroed on that promise, but the transaction was never actually confirmed
 * on chain). This never touches the treasury directly; it only adjusts the
 * internal ledger /api/withdraw reads, so a mistake here costs at most a
 * wrongly-sized future withdrawal, never a signature or a key. It is guarded
 * as sensitive as the treasury passphrase for exactly that reason: a leaked
 * token can inflate a balance that a real payout will later honor.
 */
export async function POST(request: Request) {
  if (!hasAdmin) {
    return NextResponse.json({ error: 'Admin correction is not configured.' }, { status: 503 });
  }

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const address = typeof body.address === 'string' ? body.address : '';
  const luna = body.luna;
  const memo = typeof body.memo === 'string' ? body.memo : 'manual correction';

  if (!isNimiqAddressShape(address)) {
    return NextResponse.json({ error: 'A valid Nimiq address is required.' }, { status: 400 });
  }
  if (!Number.isInteger(luna) || (luna as number) <= 0 || (luna as number) > MAX_PAYOUT_LUNA) {
    return NextResponse.json(
      { error: `luna must be a positive whole number, at most ${MAX_PAYOUT_LUNA}.` },
      { status: 400 },
    );
  }

  const current = (await get<number>(rewardsBalanceKey(address))) ?? 0;
  const balance = current + (luna as number);
  await set(rewardsBalanceKey(address), balance);
  await push('admin:credits', JSON.stringify({ address, luna, memo, at: Date.now() }));

  return NextResponse.json({ address, credited: luna, balance });
}
