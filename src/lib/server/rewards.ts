import 'server-only';

import type { GameId } from '@/lib/arcade/games';
import { compactAddress } from '@/lib/nimiq/address';
/**
 * What a coin pays and what a hazard costs.
 *
 * Imported rather than redeclared. The device shows a running estimate from
 * the same two numbers, so a second copy here would be a promise that the
 * figure a player watched climb is the figure they get credited — held
 * together by nothing but a comment. One source, and the estimate cannot
 * disagree with the payment.
 */
import { COIN_LUNA, HAZARD_LUNA } from '@/lib/wallet/earnings';

import { get, increment, set } from './store';

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
 *
 * Earning is otherwise uncapped, per round and per day. A round pays for
 * exactly what it did: twice the distance is twice the NIM, all the way up.
 * There was a 1 NIM per-round ceiling here and it was a mistake — past about
 * a thousand metres of Drift, or two hundred rows of Crossing, playing better
 * paid nothing at all, which is the opposite of what an arcade is for.
 *
 * That ceiling used to be the load-bearing guard against a crafted report,
 * back when a credited balance could be withdrawn the moment it landed. It is
 * not needed for that any more: what actually leaves the treasury is bounded
 * at the withdrawal, at 100 NIM per address per UTC day, however large a
 * balance gets — see lib/wallet/withdrawal. A fabricated report can still
 * inflate a ledger entry, but it can no longer turn into NIM any faster than
 * an honest one.
 *
 * What that trade costs, stated plainly: the ledger is now a liability that
 * can run ahead of what was really earned, and the daily withdrawal cap is
 * the only thing rationing it. Closing that properly needs verified rounds or
 * something at stake before earning, neither of which exists yet.
 */
const RATE_LUNA: Record<GameId, number> = {
  crossing: 500, // 0.005 NIM per row
  drift: 100, // 0.001 NIM per metre
  slice: 400, // 0.004 NIM per target
  invasion: 400, // 0.004 NIM per invader downed
  rush: 100, // 0.001 NIM per metre
  pitch: 5_000, // 0.05 NIM per goal — a goal is worth many metres of running
  overheat: 100, // 0.001 NIM per metre
  alley: 600, // 0.006 NIM per opponent floored
};

/**
 * Sanity ceilings, not skill ceilings — set far past any real run so a
 * genuinely good player is never rejected, while nonsense still is.
 */
const MAX_SCORE: Record<GameId, number> = {
  crossing: 100_000,
  drift: 200_000,
  slice: 100_000,
  invasion: 100_000,
  rush: 200_000,
  // A goal takes seconds of aiming, so even a marathon session stays low.
  pitch: 10_000,
  overheat: 200_000,
  alley: 100_000,
};
/**
 * The most coins a run of this length could plausibly have collected.
 *
 * A flat ceiling was the bug. Fifty coins is about what a Rush run of fifteen
 * hundred metres picks up, so once rounds started paying for their full
 * length, the better someone played the more certain they were to be refused
 * — and refused outright, losing the distance they had actually run along
 * with the coins. A player being punished for a long run is the exact
 * opposite of what removing the per-round cap was for.
 *
 * A coin count is only ever implausible relative to the distance it was
 * collected over, so the allowance grows with the run. The floor covers short
 * rounds, where a dense patch of coins can outnumber the metres.
 *
 * Set far above what the games can even spawn: Rush is the densest and lays
 * down roughly one coin every thirty units of track, which no player collects
 * in full. This is a guard against garbage and overflow, not against skill —
 * what actually bounds the treasury is the daily withdrawal cap.
 */
function maxCoinsFor(score: number): number {
  return 100 + Math.ceil(score / 25);
}

/** The daily check-in. Flat, not scaled by streak — the pool is finite. */
const CHECK_IN_LUNA = 50_000; // 0.5 NIM

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
/**
 * What this address earned today. Kept as an operational record only — it
 * gated earning when there was a daily earning cap, and nothing reads it for
 * a decision now that there is not.
 */
const dailyKey = (address: string) => `rewards:daily:${compactAddress(address)}`;
const streakKey = (address: string) => `rewards:streak:${compactAddress(address)}`;
/**
 * What has left the treasury to this address today.
 *
 * Keyed by day and holding a bare number, rather than one key holding a
 * `{ date, luna }` record. Two reasons, both about the same thing: a bare
 * number can be incremented atomically, which a record cannot, and a key per
 * day rolls over on its own instead of needing a read to notice the date
 * changed and reset it.
 */
const withdrawnKey = (address: string, day: string) =>
  `rewards:withdrawn:${compactAddress(address)}:${day}`;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

/**
 * What this address has already taken out of the treasury today.
 *
 * Separate from `dailyKey`, which counts what was *earned*. Earning is
 * uncapped; leaving is not, and conflating the two would mean a day of play
 * spent the day's withdrawal allowance without a single NIM having moved.
 *
 * For display only. Never decide a withdrawal from this — read it, decide,
 * and write, and two requests racing each other both see room that only one
 * of them can actually have. Use `reserveWithdrawal`.
 */
export async function withdrawnToday(address: string): Promise<number> {
  return (await get<number>(withdrawnKey(address, today()))) ?? 0;
}

/**
 * Claim `luna` of today's withdrawal allowance for this address.
 *
 * The check and the claim are one atomic step, which is the whole point. The
 * previous version read the day's total, decided there was room, and wrote
 * the new total — three operations that concurrent requests interleave
 * happily, so a single address could fire N withdrawals at once and have
 * every one of them pass a cap that only one should have. On serverless,
 * where invocations genuinely run in parallel, that is not a rare race; it is
 * the obvious way to attack this route.
 *
 * Incrementing first and standing the claim down if it overshot means the
 * loser of a race sees the winner's total and refuses, every time.
 */
export async function reserveWithdrawal(
  address: string,
  luna: number,
  capLuna: number,
): Promise<{ ok: true } | { ok: false; alreadyToday: number }> {
  const key = withdrawnKey(address, today());
  const total = await increment(key, luna);
  if (total <= capLuna) return { ok: true };
  await increment(key, -luna);
  return { ok: false, alreadyToday: Math.max(0, total - luna) };
}

/** Hand back an allowance claim whose payout did not go through. */
export async function releaseWithdrawal(address: string, luna: number): Promise<void> {
  await increment(withdrawnKey(address, today()), -luna);
}

export async function creditGameReward(
  address: string,
  gameId: GameId,
  score: number,
  coins: number,
  hazards = 0,
): Promise<RewardResult> {
  // Refused outright only for values that cannot come from playing at all:
  // fractions, negatives, and scores past a ceiling no real run approaches.
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE[gameId]) {
    return { ok: false, error: 'That score is not a real run.' };
  }
  if (!Number.isInteger(coins) || coins < 0) {
    return { ok: false, error: 'That coin count is not a real run.' };
  }
  if (!Number.isInteger(hazards) || hazards < 0) {
    return { ok: false, error: 'That hazard count is not a real run.' };
  }

  /*
   * Everything else is clamped rather than refused.
   *
   * A bound that is too tight and refuses costs a real player their whole
   * round; a bound that is too tight and clamps costs them the part above it
   * and pays the rest. Those are not close to equivalent when the bound turns
   * out to be wrong — and this one was. Clamping also gives up nothing
   * against a fabricated report, which ends up worth exactly the ceiling
   * either way.
   */
  const paidCoins = Math.min(coins, maxCoinsFor(score));
  const paidHazards = Math.min(hazards, maxCoinsFor(score));

  const last = (await get<number>(lastKey(address))) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) {
    return { ok: false, error: 'Play a full round before the next reward.' };
  }

  const stored = await get<DailyTotal>(dailyKey(address));
  const day: DailyTotal = stored?.date === today() ? stored : { date: today(), luna: 0 };

  // Hazards can take a round below zero; that costs the round, never the
  // balance already earned. Nothing clamps the result: a long run is worth
  // what it ran.
  const credited = Math.max(
    0,
    Math.round(score * RATE_LUNA[gameId]) + paidCoins * COIN_LUNA - paidHazards * HAZARD_LUNA,
  );

  // Atomic, like every other balance move: two rounds landing together must
  // both count, not overwrite each other.
  const balance = await increment(rewardsBalanceKey(address), credited);

  await Promise.all([
    set(lastKey(address), Date.now()),
    set(dailyKey(address), { date: day.date, luna: day.luna + credited }),
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

  const credited = CHECK_IN_LUNA;
  const balance = await increment(rewardsBalanceKey(address), credited);

  await Promise.all([
    set(streakKey(address), { date: today(), streak } satisfies StreakRecord),
    set(dailyKey(address), { date: day.date, luna: day.luna + credited }),
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

  /*
   * Debit atomically, then ask whether the debit was allowed.
   *
   * Reading the balance, checking it covers the tip, and writing the
   * remainder is three steps, and two concurrent tips of the same balance
   * both pass the check before either writes — so both credit the recipient
   * and the ledger gains NIM that nobody earned. Minted ledger NIM is a
   * treasury drain with a delay on it, because it is withdrawable like any
   * other balance.
   */
  const remaining = await increment(rewardsBalanceKey(from), -luna);
  if (remaining < 0) {
    await increment(rewardsBalanceKey(from), luna);
    return {
      ok: false,
      error: `You have ${Math.max(0, remaining + luna) / 100_000} NIM to tip with.`,
      status: 409,
    };
  }

  try {
    await increment(rewardsBalanceKey(to), luna);
  } catch (cause: unknown) {
    await increment(rewardsBalanceKey(from), luna);
    throw cause;
  }

  return { ok: true, sent: luna, balance: remaining, to };
}
