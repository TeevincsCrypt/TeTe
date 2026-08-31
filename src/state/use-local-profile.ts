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
  readPhoto,
  writeAvatarSeed,
  writeDisplayName,
  writePhoto,
} from '@/lib/profile/local-profile';

export function useLocalProfile() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarSeed, setAvatarSeed] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setDisplayName(readDisplayName());
      setAvatarSeed(readAvatarSeed());
      setPhoto(readPhoto());
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

  const savePhoto = useCallback((dataUrl: string | null) => {
    writePhoto(dataUrl);
    setPhoto(readPhoto());
  }, []);

  return { displayName, save, avatarSeed, saveAvatar, photo, savePhoto };
}
