/**
 * Arcade character skins.
 *
 * Purely cosmetic: a two-colour pair applied to whichever games draw a
 * visible player sprite. Nothing here touches hitboxes, speed, or scoring —
 * picking a character changes what you look like, never how the game plays.
 *
 * Two of the eight games have no player body to skin — Pitch is played
 * through the ball itself, Slice through a swipe with no on-screen avatar —
 * so the picker has no effect there. That is a real limit of those games'
 * design, not a gap in this file.
 *
 * `ember` is first and is the exact pair every sprite already defaults to, so
 * a player who never opens the picker sees precisely what shipped before this
 * existed.
 */
const KEY = 'tete.arcade.character.v1';

export interface Character {
  id: string;
  name: string;
  body: string;
  accent: string;
}

export const CHARACTERS: Character[] = [
  { id: 'ember', name: 'Ember', body: '#ff6a1a', accent: '#e05a12' },
  { id: 'cobalt', name: 'Cobalt', body: '#2b6cb0', accent: '#1c3f6e' },
  { id: 'volt', name: 'Volt', body: '#8bd13c', accent: '#4c6b1f' },
  { id: 'violet', name: 'Violet', body: '#6d4aff', accent: '#402458' },
  { id: 'crimson', name: 'Crimson', body: '#c23b3b', accent: '#7a231e' },
];

export const DEFAULT_CHARACTER: Character = CHARACTERS[0]!;

export function characterById(id: string | null | undefined): Character {
  return CHARACTERS.find((character) => character.id === id) ?? DEFAULT_CHARACTER;
}

export function readCharacterId(): string {
  if (typeof window === 'undefined') return DEFAULT_CHARACTER.id;
  try {
    return window.localStorage.getItem(KEY) ?? DEFAULT_CHARACTER.id;
  } catch {
    return DEFAULT_CHARACTER.id;
  }
}

export function writeCharacterId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, id);
    window.dispatchEvent(new CustomEvent('tete:character-changed'));
  } catch {
    // Best-effort, same as every other local preference in the app.
  }
}
