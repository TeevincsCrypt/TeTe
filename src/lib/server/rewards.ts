import 'server-only';

import type { GameId } from '@/lib/arcade/games';
import { compactAddress } from '@/lib/nimiq/address';

import { get, set } from './store';

/**
 * Crediting real, withdrawable NIM for arcade play.
 *
 * A client reports a game, a score, coins collected and hazards hit, and
 * nothing here re-plays the round to verify any of it — that would mean
 * re-implementing three games' physics server-side to referee them, which is
 * out of scope for casual arcade games.
 *
 * So this does not pretend to referee fairness. What it does is bound what a
 * fabricated report is worth:
 *   - score and coins are sanity-bounded, which rejects garbage and overflow
 *     rather than skilled play (a real run never comes close to these)
 *   - submissions are throttled per address, so nobody out-paces a real round
 *   - a rolling daily total per address caps what one address can ever draw
 *
 * The daily cap is the load-bearing one, and it has a known limit worth being
 * plain about: Nimiq addresses are free to generate, so a determined farmer
 * can run many addresses in parallel and the per-address cap does not stop
 * them. Closing that needs something this app does not have yet — a funded
 * wallet, a deposit, or an identity requirement before earning.
 */
const RATE_LUNA: Record<GameId, number> = {
  crossing: 500, // 0.005 NIM per row
  drift: 100, // 0.001 NIM per metre
  slice: 400, // 0.004 NIM per target
};

/** Each coin picked up in Crossing or Drift. */
const COIN_LUNA = 20_000; // 0.2 NIM
/** Each hazard hit in Crossing or Drift. Costs more than a coin earns. */
const HAZARD_LUNA = 50_000; // 0.5 NIM

/**
 * Sanity ceilings, not skill ceilings — set far past any real run so a
 * genuinely good player is never rejected, while nonsense still is.
 */
const MAX_SCORE: Record<GameId, number> = {
  crossing: 100_000,
  drift: 200_000,
  slice: 100_000,
};
const MAX_COINS = 1_000;

/** The daily check-in. Flat, not scaled by streak — the pool is finite. */
const CHECK_IN_LUNA = 50_000; // 0.5 NIM

/** Ceiling on total credited to one address per UTC day. */
const MAX_DAILY_LUNA = 20_000_000; // 200 NIM

/** Minimum real time between credited plays from the same address. */
const COOLDOWN_MS = 15_000;

interface DailyTotal {
  date: string;
  luna: number;
}

export type RewardResult =
  | { ok: true; credited: number; balance: number }
  | { ok: false; error: string };

/** The ledger the withdraw route pays out from. Shared so they cannot drift. */
export const rewardsBalanceKey = (address: string) => `rewards:${compactAddress(address)}`;
const lastKey = (address: string) => `rewards:last:${compactAddress(address)}`;
const dailyKey = (address: string) => `rewards:daily:${compactAddress(address)}`;
const streakKey = (address: string) => `rewards:streak:${compactAddress(address)}`;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

export async function creditGameReward(
  address: string,
  gameId: GameId,
  score: number,
  coins: number,
  hazards = 0,
): Promise<RewardResult> {
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE[gameId]) {
    return { ok: false, error: 'That score is not a real run.' };
  }
  if (!Number.isInteger(coins) || coins < 0 || coins > MAX_COINS) {
    return { ok: false, error: 'That coin count is not a real run.' };
  }
  if (!Number.isInteger(hazards) || hazards < 0 || hazards > MAX_COINS) {
    return { ok: false, error: 'That hazard count is not a real run.' };
  }

  const last = (await get<number>(lastKey(address))) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) {
    return { ok: false, error: 'Play a full round before the next reward.' };
  }

  const stored = await get<DailyTotal>(dailyKey(address));
  const day: DailyTotal = stored?.date === today() ? stored : { date: today(), luna: 0 };
  if (day.luna >= MAX_DAILY_LUNA) {
    return { ok: false, error: "Today's reward limit is reached. Come back tomorrow." };
  }

  // Hazards can take a round below zero; that costs the round, never the
  // balance already earned.
  const earned = Math.max(0, Math.round(score * RATE_LUNA[gameId]) + coins * COIN_LUNA - hazards * HAZARD_LUNA);
  const credited = Math.min(earned, MAX_DAILY_LUNA - day.luna);

  const current = (await get<number>(rewardsBalanceKey(address))) ?? 0;
  const balance = current + credited;

  await Promise.all([
    set(lastKey(address), Date.now()),
    set(dailyKey(address), { date: day.date, luna: day.luna + credited }),
    set(rewardsBalanceKey(address), balance),
  ]);

  return { ok: true, credited, balance };
}

interface StreakRecord {
  /** UTC day of the last claim, as YYYY-MM-DD. */
  date: string;
  streak: number;
}

export type StreakResult =
  | { ok: true; credited: number; balance: number; streak: number }
  | { ok: false; error: string };

/**
 * Claim the daily check-in for real NIM.
 *
 * The streak the device keeps is decoration; this is the one that pays, so the
 * server owns it. Claiming is once per UTC day per address — a client that
 * asks twice gets the same answer as a client that lies about its local
 * calendar, because neither is consulted.
 *
 * A claim yesterday continues the streak, any longer gap restarts it. The
 * streak is counted and shown, but it does not scale the reward: the payout is
 * flat, because a multiplier against a fixed treasury is a slow leak.
 */
export async function claimStreakReward(address: string): Promise<StreakResult> {
  const stored = await get<StreakRecord>(streakKey(address));
  if (stored?.date === today()) {
    return { ok: false, error: 'Already checked in today. Come back tomorrow.' };
  }

  const streak = stored?.date === yesterday() ? stored.streak + 1 : 1;

  const storedDay = await get<DailyTotal>(dailyKey(address));
  const day: DailyTotal = storedDay?.date === today() ? storedDay : { date: today(), luna: 0 };
  if (day.luna >= MAX_DAILY_LUNA) {
    return { ok: false, error: "Today's reward limit is reached. Come back tomorrow." };
  }

  const credited = Math.min(CHECK_IN_LUNA, MAX_DAILY_LUNA - day.luna);
  const current = (await get<number>(rewardsBalanceKey(address))) ?? 0;
  const balance = current + credited;

  await Promise.all([
    set(streakKey(address), { date: today(), streak } satisfies StreakRecord),
    set(dailyKey(address), { date: day.date, luna: day.luna + credited }),
    set(rewardsBalanceKey(address), balance),
  ]);

  return { ok: true, credited, balance, streak };
}

/** What the server thinks this address's check-in looks like right now. */
export async function readStreak(
  address: string,
): Promise<{ streak: number; claimedToday: boolean; reward: number }> {
  const stored = await get<StreakRecord>(streakKey(address));
  const claimedToday = stored?.date === today();
  // A streak only survives if the last claim was today or yesterday.
  const alive = claimedToday || stored?.date === yesterday();
  return {
    streak: alive ? (stored?.streak ?? 0) : 0,
    claimedToday,
    reward: CHECK_IN_LUNA,
  };
}

export type TipResult =
  | { ok: true; sent: number; balance: number; to: string }
  | { ok: false; error: string; status: number };

/** Smallest tip worth the bookkeeping. */
const MIN_TIP_LUNA = 10_000; // 0.1 NIM

/**
 * Move NIM from one player's reward balance to another's.
 *
 * This is a ledger transfer, not a chain transaction: no fee, instant, and it
 * works below the withdrawal minimum, which is what makes tipping small
 * amounts worth doing at all. It is also treasury-neutral by construction —
 * the same total stays owed, just to someone else — so tipping can never
 * create NIM the treasury has to find later.
 *
 * The sender is whoever signed the request, never whoever the body claims.
 */
export async function tip(from: string, to: string, luna: number): Promise<TipResult> {
  if (!Number.isInteger(luna) || luna < MIN_TIP_LUNA) {
    return { ok: false, error: `The smallest tip is ${MIN_TIP_LUNA / 100_000} NIM.`, status: 400 };
  }
  if (compactAddress(from) === compactAddress(to)) {
    return { ok: false, error: 'You cannot tip yourself.', status: 400 };
  }

  const balance = (await get<number>(rewardsBalanceKey(from))) ?? 0;
  if (balance < luna) {
    return {
      ok: false,
      error: `You have ${balance / 100_000} NIM to tip with.`,
      status: 409,
    };
  }

  // Debit first: crediting first and failing here would mint NIM out of a
  // dropped request. Debiting first can at worst lose a tip, which is
  // recoverable; minting is not.
  const remaining = balance - luna;
  await set(rewardsBalanceKey(from), remaining);
  try {
    const theirs = (await get<number>(rewardsBalanceKey(to))) ?? 0;
    await set(rewardsBalanceKey(to), theirs + luna);
  } catch (cause: unknown) {
    await set(rewardsBalanceKey(from), balance);
    throw cause;
  }

  return { ok: true, sent: luna, balance: remaining, to };
}
