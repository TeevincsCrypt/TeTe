/**
 * Turns a challenge state change into a local notice.
 *
 * There is no push channel — see the note on `notifications.ts` — so this
 * works off the poll every screen already does: each tick, compare the state
 * of every challenge you're in against what was last seen on this device, and
 * notice anything that moved. That covers the case that mattered most: an
 * opponent accepting, funding or reporting while you were looking at a
 * different screen, or had the app closed and just reopened it.
 *
 * It does not know who *caused* a transition, only that it happened, so a
 * message is only written for the side who did not just do it themselves —
 * inferred from whether that side's own action for this state is already on
 * the record (already funded, already reported), not from actually knowing
 * who acted.
 */
import { compactAddress, shortenAddress } from '@/lib/nimiq/address';
import type { Challenge, Side } from '@/lib/escrow/types';

import { pushNotice } from './notifications';

const KEY = 'tete.challenge-watch.v1';

function readSeen(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeSeen(seen: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* Storage unavailable; the next poll just re-derives the diff. */
  }
}

function mySideOf(challenge: Challenge, address: string): Side | null {
  const compact = compactAddress(address);
  if (compactAddress(challenge.host.address) === compact) return 'host';
  if (challenge.guest && compactAddress(challenge.guest.address) === compact) return 'guest';
  return null;
}

function opponentLabel(challenge: Challenge, mySide: Side): string {
  const opponent = mySide === 'host' ? challenge.guest : challenge.host;
  if (!opponent) return 'Your opponent';
  return opponent.username ? `@${opponent.username}` : shortenAddress(opponent.address);
}

/** What to say, or null when this transition is the viewer's own action. */
function describe(challenge: Challenge, mySide: Side): string | null {
  const who = opponentLabel(challenge, mySide);
  const me = mySide === 'host' ? challenge.host : challenge.guest;

  switch (challenge.state) {
    case 'accepted':
      // The guest caused this by tapping Accept — they already saw it happen.
      return mySide === 'host' ? `${who} accepted your challenge` : null;
    case 'partly_funded':
      return me?.fundingTx ? null : `${who} funded their stake — your turn`;
    case 'funded':
      return 'Both sides are funded — time to report who won';
    case 'reported':
      return me?.reported ? null : `${who} reported a result — your turn`;
    case 'disputed':
      return 'Reports do not match. This one is disputed and needs a look.';
    case 'settled':
      return challenge.winner === mySide
        ? 'You won! The payout has been sent.'
        : `Settled — the pot went to ${who}`;
    default:
      return null;
  }
}

/**
 * Diff the current state of a player's challenges against what this device
 * last saw, and push a notice for anything that changed meaningfully.
 *
 * First run on a device sees every challenge as "new" and records a baseline
 * silently — otherwise reopening the app on a fresh device would replay every
 * settled match ever played as if it just happened.
 */
export function checkChallengeUpdates(challenges: Challenge[], address: string): void {
  const seen = readSeen();
  let changed = false;

  for (const challenge of challenges) {
    const mySide = mySideOf(challenge, address);
    if (!mySide) continue;

    const previous = seen[challenge.id];
    if (previous !== undefined && previous !== challenge.state) {
      const message = describe(challenge, mySide);
      if (message) {
        const label = challenge.title?.trim() || challenge.format;
        pushNotice('result', message, label);
      }
    }
    if (previous !== challenge.state) {
      seen[challenge.id] = challenge.state;
      changed = true;
    }
  }

  if (changed) writeSeen(seen);
}
