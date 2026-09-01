/**
 * Local progression: XP, the daily check-in streak, and personal bests.
 *
 * Rewards themselves live in `lib/wallet/earnings.ts`, denominated in Luna.
 * They are recorded but unpaid: a Mini App can ask the player's wallet to send
 * funds, never send funds to a player, so paying out needs a treasury key
 * signing from a server. This file only tracks streaks and personal bests.
 */
import { addEarning, COIN_LUNA, RATE_LUNA } from '@/lib/wallet/earnings';

import type { GameId } from './games';
import { gameById, isBetter } from './games';

const KEY = 'tete.progress.v1';

export interface Progress {
  /** Local calendar day of the last claim, as YYYY-MM-DD. */
  lastCheckIn: string | null;
  streak: number;
  best: Partial<Record<GameId, number>>;
  plays: number;
}

const EMPTY: Progress = { lastCheckIn: null, streak: 0, best: {}, plays: 0 };

/** Local calendar day. Local, not UTC, so "today" matches the player's day. */
export function dayKey(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function shiftDay(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function readProgress(): Progress {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      lastCheckIn: typeof parsed.lastCheckIn === 'string' ? parsed.lastCheckIn : null,
      streak: typeof parsed.streak === 'number' ? parsed.streak : 0,
      best: typeof parsed.best === 'object' && parsed.best ? parsed.best : {},
      plays: typeof parsed.plays === 'number' ? parsed.plays : 0,
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Reward for today's check-in, in Luna. Grows with the streak, then plateaus so
 * a long run cannot drain a fixed pool on its own.
 */
export function checkInReward(streak: number): number {
  return RATE_LUNA.streakDay * (1 + Math.min(Math.max(streak - 1, 0), 6) * 0.5);
}

export function canCheckIn(progress: Progress): boolean {
  return progress.lastCheckIn !== dayKey();
}

/**
 * Claim the daily check-in. A claim yesterday continues the streak; any longer
 * gap restarts it. Claiming twice in one day is a no-op rather than an error.
 */
export function claimCheckIn(): { progress: Progress; gained: number; streak: number } {
  const current = readProgress();
  if (!canCheckIn(current)) return { progress: current, gained: 0, streak: current.streak };

  const streak = current.lastCheckIn === shiftDay(-1) ? current.streak + 1 : 1;
  const gained = Math.round(checkInReward(streak));
  const next: Progress = { ...current, lastCheckIn: dayKey(), streak };
  write(next);
  addEarning('streak', `Day ${streak} check-in`, gained);
  return { progress: next, gained, streak };
}

/**
 * Record a finished game. Returns what it earned and whether it beat the best.
 *
 * `coins` is the net pickups from that run — hazards subtract. This mirrors
 * what the server credits so the figure on screen matches, but the server's
 * own calculation is the one that counts.
 */
export function recordGame(
  id: GameId,
  score: number,
  coins = 0,
): { progress: Progress; gained: number; record: boolean } {
  const current = readProgress();
  const record = isBetter(id, score, current.best[id]);
  const next: Progress = {
    ...current,
    plays: current.plays + 1,
    best: record ? { ...current.best, [id]: score } : current.best,
  };
  write(next);
  const gained = Math.max(0, Math.round(score * RATE_LUNA[id]) + coins * COIN_LUNA);
  addEarning('game', `${gameById(id).name} — ${score}`, gained);
  return { progress: next, gained, record };
}

function write(progress: Progress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
    window.dispatchEvent(new CustomEvent('tete:progress-changed'));
  } catch {
    /* Storage unavailable — this run simply is not recorded. */
  }
}
