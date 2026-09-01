'use client';

/**
 * Watches this player's challenges in the background and turns state changes
 * into local notices — see `lib/notifications/challenge-watch.ts` for why this
 * is a poll diff rather than a push. Mounted once, in the app shell, so it
 * runs no matter which screen is open.
 */
import { useEffect, useRef } from 'react';

import { fetchMyChallenges } from '@/lib/api/client';
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
        const mine = await fetchMyChallenges(address);
        if (!cancelled) checkChallengeUpdates(mine, address);
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
