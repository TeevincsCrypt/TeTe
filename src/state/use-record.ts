'use client';

/**
 * A player's real record, read from their own challenges and computed fresh
 * on every mount — there is no cached counter to fall out of sync, only the
 * challenges themselves.
 *
 * Three states, kept distinct rather than collapsed into one "empty" case:
 * `undefined` while the read is in flight, `null` when it failed (no backend
 * configured, or a network error), and a real `Record` — genuinely zero for
 * a player with nothing settled yet — once it succeeds.
 */
import { useEffect, useState } from 'react';

import { fetchMyChallenges } from '@/lib/api/client';
import { computeRecord, type Record } from '@/lib/challenges/record';

export function useRecord(address: string | null): Record | null | undefined {
  const [record, setRecord] = useState<Record | null | undefined>(undefined);

  useEffect(() => {
    setRecord(undefined);
    if (!address) return;
    let cancelled = false;
    void (async () => {
      try {
        const challenges = await fetchMyChallenges(address);
        if (!cancelled) setRecord(computeRecord(challenges, address));
      } catch {
        if (!cancelled) setRecord(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return record;
}
