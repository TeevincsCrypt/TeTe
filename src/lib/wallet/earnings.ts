/**
 * The rewards ledger, denominated in Luna.
 *
 * Read this carefully before trusting a number it produces: **these rewards are
 * unpaid.** They are a record of what a player has earned, not a balance they
 * hold. Nothing here is on chain and nothing here is spendable.
 *
 * The reason is structural. A Mini App can ask the connected wallet to send a
 * transaction, with the player approving it on a native dialog — that is how a
 * deposit works, and it is genuinely available. There is no reverse: the app
 * cannot send funds *to* a player. Paying these rewards out requires a treasury
 * wallet whose key lives on a server that signs outgoing transactions.
 *
 * So the ledger is kept honestly and labelled as unpaid everywhere it appears.
 * When a treasury exists, it settles against exactly these entries.
 */
import { createId } from '@/lib/ids';
import { LUNA_PER_NIM } from '@/lib/nimiq/units';

const KEY = 'tete.earnings.v1';

export type EarningSource = 'game' | 'streak' | 'challenge';

export interface Earning {
  id: string;
  source: EarningSource;
  /** What produced it, e.g. a game name. */
  label: string;
  /** Amount in Luna. Integer — money is never floated. */
  luna: number;
  at: number;
}

/**
 * Reward rates, in Luna per point of score.
 *
 * These are placeholders, chosen to be small and to render as legible figures.
 * They must be tuned against a real treasury balance before anything pays out:
 * a pool is a fixed pot, and burn rate is players x sessions x these numbers.
 * Nothing here is a promise of what any player will receive.
 */
export const RATE_LUNA = {
  /** 0.005 NIM per row crossed. */
  crossing: 500,
  /** 0.001 NIM per metre driven. */
  drift: 100,
  /** 0.004 NIM per target sliced. */
  slice: 400,
  /** 0.5 NIM for a daily check-in, flat. Must match CHECK_IN_LUNA in lib/server/rewards.ts. */
  streakDay: 50_000,
} as const;

/**
 * A coin picked up mid-run. Worth more than distance, on purpose: going for a
 * coin costs a line, and that choice is where the reward should sit.
 * Must match COIN_LUNA in lib/server/rewards.ts, which is authoritative.
 */
export const COIN_LUNA = 100_000; // 1 NIM

/**
 * A hazard hit mid-run. Costs more than a coin earns, so a miss is never
 * worth trading for a coin's reward. Must match HAZARD_LUNA in
 * lib/server/rewards.ts, which is authoritative.
 */
export const HAZARD_LUNA = 50_000; // 0.5 NIM

export function readEarnings(): Earning[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEarning).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export function addEarning(source: EarningSource, label: string, luna: number): Earning[] {
  const rounded = Math.max(0, Math.round(luna));
  if (rounded === 0) return readEarnings();
  const entry: Earning = { id: createId(), source, label, luna: rounded, at: Date.now() };
  const next = [entry, ...readEarnings()].slice(0, 200);
  write(next);
  return next;
}

export function totalLuna(entries: Earning[]): number {
  return entries.reduce((sum, entry) => sum + entry.luna, 0);
}

/** Minimum unpaid balance before a payout would be worth its own fee. */
export const PAYOUT_THRESHOLD_LUNA = 25 * LUNA_PER_NIM;

function write(entries: Earning[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent('tete:earnings-changed'));
  } catch {
    /* Storage unavailable. */
  }
}

function isEarning(value: unknown): value is Earning {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Partial<Earning>;
  return typeof e.id === 'string' && typeof e.luna === 'number' && typeof e.at === 'number';
}
