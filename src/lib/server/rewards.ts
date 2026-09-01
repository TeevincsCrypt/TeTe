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

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
