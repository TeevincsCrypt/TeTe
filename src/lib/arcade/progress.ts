/**
 * Local progression: XP, the daily check-in streak, and personal bests.
 *
 * A deliberate limit, stated here because the UI states it too: **XP is not
 * NIM.** TeTe cannot pay anybody NIM. The Mini App provider only sends
 * transactions *from the connected player's own wallet, with their approval* —
 * there is no mechanism for the app to send funds *to* a player. A reward pool
 * needs a server holding a treasury key that signs payouts, which does not
 * exist here and cannot be faked client-side.
 *
 * So XP is an honest off-chain score. If a funded treasury is added later, the
 * conversion reads this same ledger; nothing recorded now has to be thrown away.
 */
import type { GameId } from './games';
import { isBetter } from './games';

const KEY = 'tete.progress.v1';

export interface Progress {
  xp: number;
  /** Local calendar day of the last claim, as YYYY-MM-DD. */
  lastCheckIn: string | null;
  streak: number;
  best: Partial<Record<GameId, number>>;
  plays: number;
}

const EMPTY: Progress = { xp: 0, lastCheckIn: null, streak: 0, best: {}, plays: 0 };

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
      xp: typeof parsed.xp === 'number' ? parsed.xp : 0,
      lastCheckIn: typeof parsed.lastCheckIn === 'string' ? parsed.lastCheckIn : null,
      streak: typeof parsed.streak === 'number' ? parsed.streak : 0,
      best: typeof parsed.best === 'object' && parsed.best ? parsed.best : {},
      plays: typeof parsed.plays === 'number' ? parsed.plays : 0,
    };
  } catch {
    return EMPTY;
  }
}

/** XP for today's check-in: grows with the streak, then plateaus. */
export function checkInReward(streak: number): number {
  return 10 + Math.min(Math.max(streak - 1, 0), 8) * 5;
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
  const gained = checkInReward(streak);
  const next: Progress = { ...current, xp: current.xp + gained, lastCheckIn: dayKey(), streak };
  write(next);
  return { progress: next, gained, streak };
}

/** Record a finished game. Returns the XP earned and whether it beat the best. */
export function recordGame(
  id: GameId,
  score: number,
  xp: number,
): { progress: Progress; gained: number; record: boolean } {
  const current = readProgress();
  const record = isBetter(id, score, current.best[id]);
  const next: Progress = {
    ...current,
    xp: current.xp + xp,
    plays: current.plays + 1,
    best: record ? { ...current.best, [id]: score } : current.best,
  };
  write(next);
  return { progress: next, gained: xp, record };
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
