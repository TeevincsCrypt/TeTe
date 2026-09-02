import { NextResponse } from 'next/server';

import { isNimiqAddressShape } from '@/lib/nimiq/address';
import { hasDurableStore } from '@/lib/server/env';
import { claimStreakReward, readStreak } from '@/lib/server/rewards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Where this address's check-in stands: streak, whether today is claimed, and what it pays. */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address') ?? '';
  if (!isNimiqAddressShape(address)) {
    return NextResponse.json({ error: 'A valid Nimiq address is required.' }, { status: 400 });
  }
  if (!hasDurableStore) {
    return NextResponse.json({ error: 'Rewards are not configured on this deployment.' }, { status: 503 });
  }

  return NextResponse.json(await readStreak(address));
}

/**
 * Claim today's check-in into the withdrawable balance.
 *
 * Unsigned, for the same reason arcade rounds are: the credit only ever lands
 * on the address in the request, so the worst a forged call can do is spend
 * that address's own once-a-day claim — and the NIM still goes to them. A
 * signature here would mean a wallet dialog for a button that pays 0.5 NIM.
 *
 * The day and the streak are the server's, not the device's, so a client that
 * rewinds its clock or replays the call gets the same refusal either way.
 */
export async function POST(request: Request) {
  if (!hasDurableStore) {
    return NextResponse.json({ error: 'Rewards are not configured on this deployment.' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const address = typeof body.address === 'string' ? body.address : '';
  if (!isNimiqAddressShape(address)) {
    return NextResponse.json({ error: 'A valid Nimiq address is required.' }, { status: 400 });
  }

  const result = await claimStreakReward(address);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({
    credited: result.credited,
    balance: result.balance,
    streak: result.streak,
  });
}
