'use client';

/**
 * React binding for the local arcade character skin. Same mount-then-sync
 * pattern as progress and the roster, so every mounted screen stays current.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  CHARACTERS,
  DEFAULT_CHARACTER,
  characterById,
  readCharacterId,
  writeCharacterId,
  type Character,
} from '@/lib/arcade/characters';

export function useCharacter() {
  const [character, setCharacterState] = useState<Character>(DEFAULT_CHARACTER);

  useEffect(() => {
    const sync = () => setCharacterState(characterById(readCharacterId()));
    sync();
    window.addEventListener('tete:character-changed', sync);
    return () => window.removeEventListener('tete:character-changed', sync);
  }, []);

  const setCharacter = useCallback((id: string) => writeCharacterId(id), []);

  return { character, characters: CHARACTERS, setCharacter };
}
