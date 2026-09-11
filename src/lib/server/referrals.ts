import 'server-only';

import { compactAddress } from '@/lib/nimiq/address';

import { recordActivity } from './activity';
import { rewardsBalanceKey } from './rewards';
import { get, set, setIfAbsent } from './store';

/**
 * Invite a friend, both get paid — once, when it's real.
 *
 * A referral code is just the referrer's own claimed TeTe name: no separate
 * code to generate or hand out, and no new claim flow. `setPendingReferral`
 * is called from `claimUsername` in players.ts, which already has the
 * signature proving the new player is real — a dedicated unsigned endpoint
 * would let anyone attribute an arbitrary address to an arbitrary referrer
 * for free. The bonus itself only pays out later, gated by that address
 * actually settling a challenge, so a bare link with nothing behind it is
 * worth nothing to fake.
 *
 * No dependency on players.ts here on purpose, even though the natural place
 * to *resolve* a referral code is the username directory — that resolution
 * happens in players.ts itself, which is the one place that can call this
 * without the two files importing each other.
 */
const REFERRAL_BONUS_LUNA = 100_000; // 1 NIM each, referrer and referee

const pendingKey = (address: string) => `referral:pending:${compactAddress(address)}`;
const claimedKey = (address: string) => `referral:claimed:${compactAddress(address)}`;
const countKey = (address: string) => `referral:count:${compactAddress(address)}`;

/** First write wins — a link, once made, cannot be overwritten by a later claim. */
export async function setPendingReferral(address: string, referrerAddress: string): Promise<void> {
  await setIfAbsent(pendingKey(address), referrerAddress);
}

/**
 * Pay out a pending referral once `address` has genuinely settled a
 * challenge. Called for both sides of every settlement, win or lose — this
 * is about a real player sticking around, not about who won.
 */
export async function maybeCreditReferral(address: string): Promise<void> {
  try {
    const compact = compactAddress(address);
    if (await get<boolean>(claimedKey(compact))) return;

    const referrerAddress = await get<string>(pendingKey(compact));
    if (!referrerAddress) return;

    // Marked claimed before crediting: a retry after a partial failure must
    // not pay the pair twice.
    await set(claimedKey(compact), true);

    const mine = ((await get<number>(rewardsBalanceKey(address))) ?? 0) + REFERRAL_BONUS_LUNA;
    await set(rewardsBalanceKey(address), mine);
    await recordActivity(address, {
      kind: 'reward',
      luna: REFERRAL_BONUS_LUNA,
      label: 'Referral bonus',
    });

    const theirs = ((await get<number>(rewardsBalanceKey(referrerAddress))) ?? 0) + REFERRAL_BONUS_LUNA;
    await set(rewardsBalanceKey(referrerAddress), theirs);
    const count = ((await get<number>(countKey(referrerAddress))) ?? 0) + 1;
    await set(countKey(referrerAddress), count);
    await recordActivity(referrerAddress, {
      kind: 'reward',
      luna: REFERRAL_BONUS_LUNA,
      label: 'Friend joined TeTe',
    });
  } catch {
    // Best-effort, same as recordActivity — never blocks a real settlement.
  }
}

export async function referralCount(address: string): Promise<number> {
  return (await get<number>(countKey(address))) ?? 0;
}
