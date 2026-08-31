'use client';

/**
 * React binding for local arcade progression. Same mount-then-sync pattern as
 * the roster and drafts, so every mounted screen stays current.
 */
import { useCallback, useEffect, useState } from 'react';

import type { GameId } from '@/lib/arcade/games';
import {
  canCheckIn,
  claimCheckIn,
  readProgress,
  recordGame,
  type Progress,
} from '@/lib/arcade/progress';

const EMPTY: Progress = { lastCheckIn: null, streak: 0, best: {}, plays: 0 };

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => {
      setProgress(readProgress());
      setLoaded(true);
    };
    sync();
    window.addEventListener('tete:progress-changed', sync);
    return () => window.removeEventListener('tete:progress-changed', sync);
  }, []);

  const claim = useCallback(() => {
    const result = claimCheckIn();
    setProgress(result.progress);
    return result;
  }, []);

  const record = useCallback((id: GameId, score: number) => {
    const result = recordGame(id, score);
    setProgress(result.progress);
    return result;
  }, []);

  return { progress, loaded, claim, record, checkInAvailable: loaded && canCheckIn(progress) };
}
