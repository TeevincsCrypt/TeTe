/**
 * Turns a tournament's progress into local notices.
 *
 * A bracket is watched on top of, not instead of, the ordinary challenge
 * watcher: every round is a real Challenge, and challenge-watch.ts already
 * announces funding, reporting and settling for those. What only a bracket
 * knows is when a *new* round gets created for you — advancing without
 * having to go looking for it — and when the whole thing is over.
 */
import type { Bracket } from '@/lib/bracket/types';
import { compactAddress, shortenAddress } from '@/lib/nimiq/address';

import { pushNotice } from './notifications';

const KEY = 'tete.bracket-watch.v1';
/** Set once this device has taken a baseline, so a first sync stays silent. */
const READY_KEY = 'tete.bracket-watch.ready.v1';
/** A marker recorded alongside seen match ids once a bracket's champion has been announced. */
const CHAMPION_MARK = '__champion__';

function readSeen(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function writeSeen(seen: Record<string, string[]>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* Storage unavailable; the next sync just re-derives the diff. */
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

function nameOf(entrant: { address: string; username?: string } | undefined): string {
  if (!entrant) return 'Somebody';
  return entrant.username ? `@${entrant.username}` : shortenAddress(entrant.address);
}

/**
 * Diff a player's tournaments against what this device last saw, and push a
 * notice for any new round that names them, or a champion just crowned.
 *
 * The first sync records a baseline silently, same as challenge-watch and
 * activity-watch — otherwise opening the app on a fresh device would replay
 * every round of every tournament ever played as if it just happened.
 */
export function checkBracketUpdates(brackets: Bracket[], address: string): void {
  const seen = readSeen();
  const baselined = hasBaseline();
  let changed = false;

  for (const bracket of brackets) {
    const mySlot = bracket.entrants.findIndex(
      (entrant) => compactAddress(entrant.address) === compactAddress(address),
    );
    if (mySlot === -1) continue;

    const known = seen[bracket.id] ?? [];
    const knownIds = new Set(known);
    const nextKnown = [...known];

    for (const match of bracket.matches) {
      if (!match.challengeId || knownIds.has(match.challengeId)) continue;
      nextKnown.push(match.challengeId);
      changed = true;
      if (baselined && (match.slotA === mySlot || match.slotB === mySlot)) {
        pushNotice(
          'challenge',
          match.round === 0 ? 'Your tournament match is ready' : 'You advanced — your next match is ready',
          bracket.title?.trim() || `${bracket.format} tournament`,
          `/challenges/${match.challengeId}`,
        );
      }
    }

    if (bracket.state === 'complete' && !knownIds.has(CHAMPION_MARK)) {
      nextKnown.push(CHAMPION_MARK);
      changed = true;
      if (baselined) {
        const iWon = bracket.championSlot === mySlot;
        pushNotice(
          'result',
          iWon ? 'You won the tournament' : 'Tournament complete',
          iWon
            ? 'The full pot has been sent to your wallet.'
            : `${nameOf(bracket.entrants[bracket.championSlot ?? -1])} took the tournament.`,
          `/brackets/${bracket.id}`,
        );
      }
    }

    if (nextKnown.length !== known.length) seen[bracket.id] = nextKnown;
  }

  if (changed) writeSeen(seen);
  if (!baselined) markBaseline();
}
