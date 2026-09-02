/**
 * Turns money arriving into something the player is actually told about.
 *
 * A tip lands on the server, in the recipient's balance. Their phone did
 * nothing, so nothing local knew about it: the balance simply differed the
 * next time they looked. This diffs the server's activity feed against what
 * this device has already announced, and says the rest.
 *
 * Only incoming entries are announced. A player does not need telling about
 * the tip they just sent or the round they just played — they were there.
 */
import type { ActivityEntry } from '@/lib/api/client';
import { formatNim } from '@/lib/nimiq/units';

import { pushNotice } from './notifications';

const KEY = 'tete.activity-watch.v1';
/** Set once this device has a baseline, so a first sync stays silent. */
const READY_KEY = 'tete.activity-watch.ready.v1';

function readSeen(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function writeSeen(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep the window bounded; the feed itself is capped server-side.
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 200)));
  } catch {
    /* Storage unavailable — the next sync re-derives what it can. */
  }
}

function hasBaseline(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(READY_KEY) === '1';
  } catch {
    return true;
  }
}

function markBaseline(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(READY_KEY, '1');
  } catch {
    /* Storage unavailable; every sync then behaves like a first one. */
  }
}

/** What to say about an entry, or null when it needs no announcement. */
function describe(entry: ActivityEntry): { title: string; body: string } | null {
  const amount = `${formatNim(Math.abs(entry.luna), { maximumFractionDigits: 2 })} NIM`;
  switch (entry.kind) {
    case 'tip-in':
      return { title: `${entry.label} tipped you ${amount}`, body: 'It is in your balance now.' };
    case 'payout':
      return { title: `You won ${amount}`, body: entry.label };
    default:
      // Rewards, check-ins, withdrawals and tips sent are all things the
      // player did themselves, on this device, and already saw happen.
      return null;
  }
}

/**
 * Diff the server's activity feed against what this device has announced.
 *
 * The first sync records a baseline silently, so installing the app does not
 * replay every tip ever received as if it just arrived.
 */
export function checkActivityUpdates(entries: ActivityEntry[]): void {
  const seen = new Set(readSeen());
  const baselined = hasBaseline();
  let changed = false;

  // Oldest first, so a burst of notices reads in the order things happened.
  for (const entry of [...entries].sort((a, b) => a.at - b.at)) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    changed = true;

    if (!baselined) continue;
    const said = describe(entry);
    if (said) pushNotice('reward', said.title, said.body, entry.href ?? '/wallet');
  }

  if (changed) writeSeen([...seen]);
  if (!baselined) markBaseline();
}
