'use client';

/**
 * Live challenge lists: the open board, and this player's own.
 *
 * There is no push channel — the backend is a set of stateless API routes —
 * so this polls. It only does so while the tab is visible and only while a
 * wallet is connected, which keeps it from hammering the API from a
 * backgrounded phone.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { backendReady, fetchMyChallenges, fetchOpenChallenges } from '@/lib/api/client';
import type { Challenge } from '@/lib/escrow/types';

const POLL_MS = 6_000;

export type Backend = 'checking' | 'ready' | 'unavailable';

export function useChallenges(address: string | null) {
  const [backend, setBackend] = useState<Backend>('checking');
  const [board, setBoard] = useState<Challenge[]>([]);
  const [mine, setMine] = useState<Challenge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const ready = await backendReady();
      setBackend(ready ? 'ready' : 'unavailable');
      if (!ready) return;

      const [openList, myList] = await Promise.all([
        fetchOpenChallenges(),
        address ? fetchMyChallenges(address) : Promise.resolve([]),
      ]);
      // The board should not repeat challenges the player already owns a role in.
      const mineIds = new Set(myList.map((c) => c.id));
      setBoard(openList.filter((c) => !mineIds.has(c.id)));
      setMine(myList);
    } catch {
      setBackend('unavailable');
    } finally {
      setLoaded(true);
      inFlight.current = false;
    }
  }, [address]);

  useEffect(() => {
    void refresh();

    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  return { backend, board, mine, loaded, refresh };
}
