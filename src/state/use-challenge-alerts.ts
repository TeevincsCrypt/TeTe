'use client';

/**
 * Watches this player's challenges, tournaments and balance activity in the
 * background and turns what changed into local notices — see
 * `challenge-watch.ts` for why this is a poll diff rather than a push.
 * Mounted once, in the app shell, so it runs no matter which screen is open.
 *
 * All three feeds are polled on the same tick: a tip arriving, an opponent
 * accepting, and a tournament round opening up are the same kind of event to
 * a player, and none of them should need its own timer.
 */
import { useEffect, useRef } from 'react';

import { fetchActivity, fetchMyBrackets, fetchMyChallenges } from '@/lib/api/client';
import { checkActivityUpdates } from '@/lib/notifications/activity-watch';
import { checkBracketUpdates } from '@/lib/notifications/bracket-watch';
import { checkChallengeUpdates } from '@/lib/notifications/challenge-watch';

const POLL_MS = 6_000;

export function useChallengeAlerts(address: string | null): void {
  const inFlight = useRef(false);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    const tick = async () => {
      if (inFlight.current || document.visibilityState !== 'visible') return;
      inFlight.current = true;
      try {
        const [mine, activity, brackets] = await Promise.all([
          fetchMyChallenges(address),
          fetchActivity(address),
          fetchMyBrackets(address),
        ]);
        if (cancelled) return;
        checkChallengeUpdates(mine, address);
        if (activity) checkActivityUpdates(activity);
        checkBracketUpdates(brackets, address);
      } catch {
        /* Backend unavailable or a transient error — the next tick retries. */
      } finally {
        inFlight.current = false;
      }
    };

    void tick();
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [address]);
}
