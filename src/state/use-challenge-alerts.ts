'use client';

/**
 * Watches this player's challenges and balance activity in the background and
 * turns what changed into local notices — see `challenge-watch.ts` for why
 * this is a poll diff rather than a push. Mounted once, in the app shell, so
 * it runs no matter which screen is open.
 *
 * Both feeds are polled on the same tick: a tip arriving and an opponent
 * accepting are the same kind of event to a player, and neither should need a
 * second timer.
 */
import { useEffect, useRef } from 'react';

import { fetchActivity, fetchMyChallenges } from '@/lib/api/client';
import { checkActivityUpdates } from '@/lib/notifications/activity-watch';
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
        const [mine, activity] = await Promise.all([
          fetchMyChallenges(address),
          fetchActivity(address),
        ]);
        if (cancelled) return;
        checkChallengeUpdates(mine, address);
        if (activity) checkActivityUpdates(activity);
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
