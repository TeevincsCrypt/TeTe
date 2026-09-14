import 'server-only';

import { compactAddress } from '@/lib/nimiq/address';

import { recordActivity } from './activity';
import { lookupAddress } from './players';
import { get, set } from './store';
import { payout } from './treasury';

/**
 * Daily and weekly rankings, by real NIM earned.
 *
 * Everything that pays a player counts: a settled challenge, a finished
 * arcade round, a daily check-in. The board was challenge-only, which made
 * it a board for one of the three things TeTe actually pays for — a player
 * could grind the arcade all week, be owed real NIM for it, and not appear.
 *
 * It stays denominated in Luna rather than in points. A points formula would
 * be a second definition of "doing well" to keep in sync with the first, and
 * the first is already unambiguous: NIM credited to you. Every source is
 * counted at face value, so the board means exactly what the balance means.
 *
 * What is NOT counted is a carried-forward bracket round, where nothing has
 * left the treasury yet. Crediting one would put a payout on the board that
 * has not happened.
 *
 * Each period's table is one JSON object, read, updated and written back —
 * simple, and good enough at TeTe's current scale. A rare lost increment
 * from two credits landing in the same instant costs a fraction of a
 * leaderboard placement, never money: the underlying credit already happened
 * and was already recorded for real in the player's own balance and activity
 * feed regardless of what this table shows.
 */
export type LeaderboardPeriod = 'daily' | 'weekly';

/** Where a player's NIM came from. Scored the same; shown separately. */
export type LeaderboardSource = 'challenge' | 'arcade' | 'streak';

export const LEADERBOARD_SOURCES: LeaderboardSource[] = ['challenge', 'arcade', 'streak'];

export interface LeaderboardEntry {
  address: string;
  username?: string;
  /** Total across every source — what the ranking and the prizes use. */
  luna: number;
  /**
   * The same total split by where it came from.
   *
   * Optional because entries written before the board counted more than
   * challenges have no split, and a board that crashed on last week's rows
   * would be worse than one that shows them without a breakdown. Read it
   * through `breakdown()` rather than directly.
   */
  by?: Partial<Record<LeaderboardSource, number>>;
}

/**
 * An entry's split by source, with the gap filled in.
 *
 * An entry stored before this existed has a total and no split; the total
 * was challenge winnings by definition, because that was all the board
 * counted, so that is where it is attributed rather than being dropped.
 */
export function breakdown(entry: LeaderboardEntry): Record<LeaderboardSource, number> {
  if (!entry.by) return { challenge: entry.luna, arcade: 0, streak: 0 };
  return {
    challenge: entry.by.challenge ?? 0,
    arcade: entry.by.arcade ?? 0,
    streak: entry.by.streak ?? 0,
  };
}

type LeaderboardTable = Record<string, LeaderboardEntry>;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** The UTC calendar date, e.g. "2026-09-13" — the daily period key. */
export function dailyKey(at: number = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** The UTC date of that week's Monday — the weekly period key. */
export function weeklyKey(at: number = Date.now()): string {
  const d = new Date(at);
  const sinceMonday = (d.getUTCDay() + 6) % 7; // getUTCDay(): 0 = Sunday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday));
  return monday.toISOString().slice(0, 10);
}

/** The week before the one `at` falls in — for paying out a week that just ended. */
export function previousWeeklyKey(at: number = Date.now()): string {
  return weeklyKey(at - WEEK_MS);
}

function tableKey(period: LeaderboardPeriod, key: string): string {
  return `leaderboard:${period}:${key}`;
}

/**
 * Credit real NIM to both the daily and weekly tables at once.
 *
 * Best-effort by design, and called from three places — a settled challenge,
 * a finished arcade round, a daily check-in — always *after* the credit
 * itself has gone through. Nothing here can turn a real payment into a
 * failure, which is why every path swallows its own errors.
 */
export async function creditLeaderboard(
  address: string,
  username: string | undefined,
  luna: number,
  source: LeaderboardSource,
): Promise<void> {
  if (!Number.isFinite(luna) || luna <= 0) return;
  try {
    await Promise.all([
      addToTable('daily', dailyKey(), address, username, luna, source),
      addToTable('weekly', weeklyKey(), address, username, luna, source),
    ]);
  } catch {
    /* Best-effort, same as maybeCreditReferral — never blocks a real credit. */
  }
}

/**
 * Look up who this is, then put their credit on both boards.
 *
 * The convenience wrapper the arcade and check-in routes use. It lives here
 * rather than in `rewards` because that module must not reach for `players`,
 * which reaches for `referrals`, which reaches back for the rewards ledger
 * key — a cycle. Nothing in that chain imports this module, so the lookup is
 * safe from here.
 *
 * Best-effort and swallowed: the NIM is already on the player's balance by
 * the time this runs, and a board missing a row is not worth failing a
 * credit over. The username lookup costs one read on a path already
 * throttled to a credit every fifteen seconds, and it is what lets a player
 * who only ever plays the arcade appear under a name rather than a truncated
 * address.
 */
export async function scoreOnLeaderboard(
  address: string,
  luna: number,
  source: LeaderboardSource,
): Promise<void> {
  if (luna <= 0) return;
  try {
    const player = await lookupAddress(address);
    await creditLeaderboard(address, player?.username, luna, source);
  } catch {
    /* Never blocks a credit that has already happened. */
  }
}

async function addToTable(
  period: LeaderboardPeriod,
  key: string,
  address: string,
  username: string | undefined,
  luna: number,
  source: LeaderboardSource,
): Promise<void> {
  const compact = compactAddress(address);
  const table = (await get<LeaderboardTable>(tableKey(period, key))) ?? {};
  const existing = table[compact];
  // Through `breakdown`, so an entry written before the split existed keeps
  // its total attributed rather than losing it on the next credit.
  const by = existing ? breakdown(existing) : { challenge: 0, arcade: 0, streak: 0 };
  by[source] += luna;
  table[compact] = {
    address,
    username: username ?? existing?.username,
    luna: (existing?.luna ?? 0) + luna,
    by,
  };
  await set(tableKey(period, key), table);
}

/** The top entries for one period, highest total first. */
export async function topEntries(period: LeaderboardPeriod, key: string, limit = 10): Promise<LeaderboardEntry[]> {
  const table = (await get<LeaderboardTable>(tableKey(period, key))) ?? {};
  return Object.values(table)
    .sort((a, b) => b.luna - a.luna)
    .slice(0, limit);
}

/** Where `address` currently stands in a period — 1-based, or null if they have not scored yet. */
export async function rankOf(period: LeaderboardPeriod, key: string, address: string): Promise<number | null> {
  const table = (await get<LeaderboardTable>(tableKey(period, key))) ?? {};
  const compact = compactAddress(address);
  const ranked = Object.values(table).sort((a, b) => b.luna - a.luna);
  const index = ranked.findIndex((entry) => compactAddress(entry.address) === compact);
  return index === -1 ? null : index + 1;
}

/** Prizes for the weekly top 3, in Luna: 100, 50 and 30 NIM. */
export const WEEKLY_PRIZES_LUNA = [100 * 100_000, 50 * 100_000, 30 * 100_000] as const;

const paidKey = (key: string) => `leaderboard:weekly:${key}:paid`;

export interface WeeklyPrizeResult {
  week: string;
  paid: { address: string; username?: string; luna: number; hash: string }[];
  alreadyPaid: boolean;
}

/**
 * Pay the previous week's top 3 for real, once. Meant to be called by a
 * weekly cron (see vercel.json and /api/cron/weekly-prizes) — idempotent, so
 * a retried or duplicated trigger cannot pay the same week twice.
 */
export async function payWeeklyPrizes(at: number = Date.now()): Promise<WeeklyPrizeResult> {
  const week = previousWeeklyKey(at);

  // Claimed before paying, same reasoning as any other payout here: a
  // second call — a retry, a duplicate cron trigger — must see this week as
  // already handled rather than paying it again.
  const already = await get<boolean>(paidKey(week));
  if (already) return { week, paid: [], alreadyPaid: true };
  await set(paidKey(week), true);

  const top = await topEntries('weekly', week, 3);
  const paid: WeeklyPrizeResult['paid'] = [];

  for (let i = 0; i < top.length; i += 1) {
    const entry = top[i];
    const luna = WEEKLY_PRIZES_LUNA[i];
    if (!entry || !luna) continue;
    try {
      const hash = await payout(entry.address, luna, `tete:leaderboard:${week}:${i + 1}`);
      await recordActivity(entry.address, {
        kind: 'prize',
        luna,
        label: `#${i + 1} on the weekly leaderboard`,
        href: '/leaderboard',
      });
      paid.push({ address: entry.address, username: entry.username, luna, hash });
    } catch {
      // One recipient's payout failing must not block the other two — the
      // failed one simply is not recorded as paid, and can be corrected by
      // hand the same way any other stuck payout already is (see
      // /api/admin/credit) rather than retried automatically here.
    }
  }

  return { week, paid, alreadyPaid: false };
}
