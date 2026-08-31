'use client';

/**
 * React binding for the locally stored display name.
 *
 * Reads happen after mount so the server and first client render agree, then a
 * custom event keeps every mounted screen in sync when the name changes —
 * cheaper than lifting this into the wallet provider, which has no business
 * knowing about decoration.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  readAvatarSeed,
  readDisplayName,
  writeAvatarSeed,
  writeDisplayName,
} from '@/lib/profile/local-profile';

export function useLocalProfile() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarSeed, setAvatarSeed] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => {
      setDisplayName(readDisplayName());
      setAvatarSeed(readAvatarSeed());
    };
    sync();
    window.addEventListener('tete:profile-changed', sync);
    return () => window.removeEventListener('tete:profile-changed', sync);
  }, []);

  const save = useCallback((name: string) => {
    writeDisplayName(name);
    setDisplayName(readDisplayName());
  }, []);

  const saveAvatar = useCallback((seed: number | null) => {
    writeAvatarSeed(seed);
    setAvatarSeed(readAvatarSeed());
  }, []);

  return { displayName, save, avatarSeed, saveAvatar };
}
