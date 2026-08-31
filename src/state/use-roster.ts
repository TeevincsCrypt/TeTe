'use client';

/**
 * React binding for the locally saved roster of opponents.
 * Same mount-then-sync pattern as drafts, so server and client agree on the
 * first render and every mounted screen stays current.
 */
import { useCallback, useEffect, useState } from 'react';

import { addPlayer, readRoster, removePlayer, type RosterPlayer } from '@/lib/roster/roster';

export function useRoster() {
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => {
      setPlayers(readRoster());
      setLoaded(true);
    };
    sync();
    window.addEventListener('tete:roster-changed', sync);
    return () => window.removeEventListener('tete:roster-changed', sync);
  }, []);

  const add = useCallback((username: string, address: string) => {
    const result = addPlayer(username, address);
    if (result.ok) setPlayers(readRoster());
    return result;
  }, []);

  const remove = useCallback((id: string) => setPlayers(removePlayer(id)), []);

  return { players, loaded, add, remove };
}
