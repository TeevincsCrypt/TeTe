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
/** Set once this device has taken a baseline, so a first sync stays silent. */
const READY_KEY = 'tete.challenge-watch.ready.v1';

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

/**
 * What this device last saw of a challenge.
 *
 * The state alone is not enough once a dispute is running: an opponent
 * changing their answer or offering to call it off both matter to the other
 * player and neither moves the state, so they would pass in silence — which
 * is the whole failure a dispute screen exists to avoid. While disputed, the
 * signature carries what each side is claiming and asking for as well.
 */
function signatureOf(challenge: Challenge): string {
  if (challenge.state !== 'disputed') return challenge.state;
  const mark = (party?: { reported?: Side; voidRequestedAt?: number }) =>
    `${party?.reported ?? '-'}${party?.voidRequestedAt ? 'v' : ''}`;
  return `disputed:${mark(challenge.host)}:${mark(challenge.guest)}`;
}

/** What to say, or null when this transition is the viewer's own action. */
function describe(challenge: Challenge, mySide: Side, previous: string): string | null {
  const who = opponentLabel(challenge, mySide);
  const me = mySide === 'host' ? challenge.host : challenge.guest;

  if (challenge.state === 'disputed') {
    const them = mySide === 'host' ? challenge.guest : challenge.host;
    // Arriving in a dispute is worth saying once; after that only what the
    // other side newly did is news, and only to the side that did not do it.
    if (!previous.startsWith('disputed')) {
      return 'You both claimed the win — nothing has been paid. Sort it out.';
    }
    // Positional: `disputed:<host>:<guest>`, so their half is the other one.
    const parts = previous.split(':');
    const theirPrevious = mySide === 'host' ? parts[2] : parts[1];
    if (them?.voidRequestedAt && !theirPrevious?.includes('v')) {
      return `${who} wants to call it off and take both stakes back`;
    }
    return `${who} changed their answer`;
  }

  switch (challenge.state) {
    case 'accepted':
      // The guest caused this by tapping Accept — they already saw it happen.
      return mySide === 'host' ? `${who} accepted your challenge` : null;
    case 'partly_funded':
      // Whoever has not paid is being waited on; whoever has just watched the
      // other side pay. Both are worth saying, and saying nothing to the
      // player who already staked is why "he added his stake" went unnoticed.
      return me?.fundingTx
        ? `${who} has not staked yet — you are waiting on them`
        : `${who} staked — your turn`;
    case 'funded':
      return 'Both stakes are in — say who won when you have played';
    case 'reported':
      return me?.reported ? null : `${who} reported a result — your turn`;
    case 'settled':
      return challenge.winner === mySide
        ? 'You won! The payout has been sent.'
        : `Settled — the pot went to ${who}`;
    case 'refunded':
      // Only worth saying when a dispute ended this way; an ordinary call-off
      // already tells whoever did it, and the other side sees the refund.
      return challenge.resolvedBy
        ? 'Called off — your stake has been sent back'
        : null;
    default:
      return null;
  }
}

/**
 * Diff the current state of a player's challenges against what this device
 * last saw, and push a notice for anything that changed meaningfully.
 *
 * The very first sync on a device records a baseline silently — otherwise
 * opening the app on a fresh device would replay every settled match ever
 * played as if it just happened. After that, a challenge id this device has
 * never seen is genuinely new, and being called out by name is exactly the
 * thing worth saying: it used to be swallowed by the same baseline rule that
 * exists for the history, which is why a challenged friend was never told.
 *
 * This is still not a push notification. A Mini App cannot wake a phone, so
 * the notice lands the next time they open TeTe.
 */
export function checkChallengeUpdates(challenges: Challenge[], address: string): void {
  const seen = readSeen();
  const baselined = hasBaseline();
  let changed = false;

  for (const challenge of challenges) {
    const mySide = mySideOf(challenge, address);
    if (!mySide) continue;

    const previous = seen[challenge.id];
    const signature = signatureOf(challenge);

    if (previous === undefined) {
      // New to this device. Worth announcing only when it is waiting on them:
      // someone aimed a challenge at them and it has not been accepted yet.
      if (baselined && mySide === 'guest' && challenge.state === 'open') {
        const label = challenge.title?.trim() || challenge.format;
        pushNotice(
          'challenge',
          `${opponentLabel(challenge, mySide)} challenged you`,
          label,
          `/challenges/${challenge.id}`,
        );
      }
    } else if (previous !== signature) {
      const message = describe(challenge, mySide, previous);
      if (message) {
        const label = challenge.title?.trim() || challenge.format;
        pushNotice('result', message, label, `/challenges/${challenge.id}`);
      }
    }

    if (previous !== signature) {
      seen[challenge.id] = signature;
      changed = true;
    }
  }

  if (changed) writeSeen(seen);
  if (!baselined) markBaseline();
}
