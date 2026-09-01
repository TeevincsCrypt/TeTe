import 'server-only';

import type { GameId } from '@/lib/arcade/games';

import { get, set } from './store';

/**
 * Crediting real, withdrawable NIM for arcade play.
 *
 * A client reports a game and a score, and nothing here re-plays that game to
 * verify it — doing that would mean re-implementing three games' physics
 * server-side just to referee them, which is out of scope for what these are:
 * casual arcade games, not something anyone is meant to get rich playing.
 *
 * Given that, the honest design is not to pretend to referee fairness, but to
 * bound the damage a fabricated score can do, in layers:
 *   - every game has a hard score ceiling a legitimate run cannot exceed
 *   - every single submission is capped in Luna, regardless of the score claimed
 *   - submissions are throttled per address, so spamming this endpoint cannot
 *     out-pace a real play session
 *   - a rolling daily total per address caps worst-case drain even under
 *     sustained abuse from one compromised device
 *
 * None of this is provable fair play. It is a small, capped faucet, sized so
 * that gaming it is not worth the effort — the same trade-off the arcade
 * itself is honest about elsewhere ("recorded, not yet payable" becomes
 * "recorded and payable, within these limits").
 */
const RATE_LUNA: Record<GameId, number> = {
  crossing: 5_000, // 0.05 NIM per row
  drift: 1_000, // 0.01 NIM per metre
  slice: 4_000, // 0.04 NIM per target
};

/** Above this, a reported score cannot be a legitimate single run. */
const MAX_SCORE: Record<GameId, number> = {
  crossing: 300,
  drift: 800,
  slice: 200,
};

/** Ceiling on any one submission, regardless of the score claimed. */
const MAX_SUBMISSION_LUNA = 100_000; // 1 NIM

/** Ceiling on total credited to one address per UTC day. */
const MAX_DAILY_LUNA = 500_000; // 5 NIM

/** Minimum real time between credited plays from the same address. */
const COOLDOWN_MS = 15_000;

interface DailyTotal {
  date: string;
  luna: number;
}

export type RewardResult =
  | { ok: true; credited: number; balance: number }
  | { ok: false; error: string };

const compact = (address: string) => address.replace(/\s+/g, '').toUpperCase();
const lastKey = (address: string) => `rewards:last:${compact(address)}`;
const dailyKey = (address: string) => `rewards:daily:${compact(address)}`;
// Same key the withdraw route reads — this is the ledger it pays out.
const balanceKey = (address: string) => `rewards:${address.replace(/\s+/g, '')}`;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function creditGameReward(
  address: string,
  gameId: GameId,
  score: number,
): Promise<RewardResult> {
  if (!Number.isInteger(score) || score <= 0) {
    return { ok: false, error: 'Score must be a positive whole number.' };
  }
  if (score > MAX_SCORE[gameId]) {
    return { ok: false, error: 'That score is not possible for this game.' };
  }

  const last = (await get<number>(lastKey(address))) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) {
    return { ok: false, error: 'Play a full round before claiming the next reward.' };
  }

  const stored = await get<DailyTotal>(dailyKey(address));
  const day: DailyTotal = stored?.date === today() ? stored : { date: today(), luna: 0 };
  if (day.luna >= MAX_DAILY_LUNA) {
    return { ok: false, error: "Today's reward limit is reached. Come back tomorrow." };
  }

  const requested = Math.round(score * RATE_LUNA[gameId]);
  const capped = Math.min(requested, MAX_SUBMISSION_LUNA);
  const credited = Math.min(capped, MAX_DAILY_LUNA - day.luna);

  const current = (await get<number>(balanceKey(address))) ?? 0;
  const balance = current + credited;

  await Promise.all([
    set(lastKey(address), Date.now()),
    set(dailyKey(address), { date: day.date, luna: day.luna + credited }),
    set(balanceKey(address), balance),
  ]);

  return { ok: true, credited, balance };
}
