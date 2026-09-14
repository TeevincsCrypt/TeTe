import 'server-only';

import { compactAddress } from '@/lib/nimiq/address';

import { recordActivity } from './activity';
import { get, set } from './store';
import { payout } from './treasury';

/**
 * Daily and weekly rankings, by real NIM won.
 *
 * Scored off the same event as the recent-wins feed and referral bonus — a
 * genuine payout, from payWinner in lib/server/challenges.ts — and never off
 * a carried-forward bracket round, where nothing has actually left the
 * treasury yet. A player's daily and weekly totals are simply the sum of
 * every real payout they have received in that window; there is no separate
 * points formula to keep in sync with what "winning" actually means
 * elsewhere in the app.
 *
 * Each period's table is one JSON object, read, updated and written back —
 * simple, and good enough at TeTe's current scale. A rare lost increment
 * from two settlements landing in the same instant costs a fraction of a
 * leaderboard placement, never money: the underlying payout already
 * happened and was already recorded for real in the player's own activity
 * feed regardless of what this table shows.
 */
export type LeaderboardPeriod = 'daily' | 'weekly';

export interface LeaderboardEntry {
  address: string;
  username?: string;
  luna: number;
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
 * Credit a real win to both the daily and weekly tables at once. Best-effort
 * — called from payWinner alongside the recent-wins feed and referral bonus,
 * after the payout has already gone out, so nothing here can turn a real
 * payout into a failure.
 */
export async function creditLeaderboard(address: string, username: string | undefined, luna: number): Promise<void> {
  try {
    await Promise.all([
      addToTable('daily', dailyKey(), address, username, luna),
      addToTable('weekly', weeklyKey(), address, username, luna),
    ]);
  } catch {
    /* Best-effort, same as maybeCreditReferral — never blocks a real settlement. */
  }
}

async function addToTable(
  period: LeaderboardPeriod,
  key: string,
  address: string,
  username: string | undefined,
  luna: number,
): Promise<void> {
  const compact = compactAddress(address);
  const table = (await get<LeaderboardTable>(tableKey(period, key))) ?? {};
  const existing = table[compact];
  table[compact] = {
    address,
    username: username ?? existing?.username,
    luna: (existing?.luna ?? 0) + luna,
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
