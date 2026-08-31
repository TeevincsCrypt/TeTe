'use client';

/**
 * React binding for locally stored challenge drafts.
 *
 * Drafts are local-only and unfunded; see `lib/challenges/drafts.ts`. Screens
 * stay in sync through the same custom-event channel the profile name uses.
 */
import { useCallback, useEffect, useState } from 'react';

import { deleteDraft, readDrafts } from '@/lib/challenges/drafts';
import type { ChallengeDraft } from '@/lib/challenges/types';

export function useDrafts() {
  const [drafts, setDrafts] = useState<ChallengeDraft[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => {
      setDrafts(readDrafts());
      setLoaded(true);
    };
    sync();
    window.addEventListener('tete:drafts-changed', sync);
    return () => window.removeEventListener('tete:drafts-changed', sync);
  }, []);

  const remove = useCallback((id: string) => setDrafts(deleteDraft(id)), []);

  return { drafts, loaded, remove };
}
