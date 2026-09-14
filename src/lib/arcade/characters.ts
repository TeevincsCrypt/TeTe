/**
 * Arcade characters.
 *
 * Purely cosmetic: nothing here touches hitboxes, speed, or scoring — picking
 * a character changes what you look like, never how the game plays.
 *
 * These were five colour swatches, which made "choose your character" a
 * recolour rather than a choice. Each one now carries a `Look`: the gear and
 * proportions the 3D builder assembles, so a pick is legible as a silhouette
 * before you can even read the colour — a heavy trooper, a caped warden and a
 * slim sprinter are told apart at a glance in motion, which a hex pair never
 * managed.
 *
 * Every design is original. The roster deliberately does not reproduce any
 * existing game's character, costume or mark, which is the same rule the
 * games and cover art already hold to.
 *
 * Two of the eight games have no player body to skin — Pitch is played
 * through the ball itself, Slice through a swipe with no on-screen avatar —
 * so the picker has no effect there. That is a real limit of those games'
 * design, not a gap in this file.
 */
const KEY = 'tete.arcade.character.v1';

/** The parts the 3D character builder assembles. */
export interface Look {
  body: string;
  accent: string;
  /** Headgear, which is most of what separates one silhouette from another. */
  helmet?: 'none' | 'cap' | 'full' | 'crest';
  /** A lit band across the helmet. Only drawn when the helmet has a face. */
  visor?: string;
  cape?: boolean;
  pack?: boolean;
  scarf?: boolean;
  hair?: 'none' | 'short' | 'ponytail';
  /** Build, as a multiplier on torso and limb thickness. 1 is standard. */
  bulk?: number;
}

export interface Character extends Look {
  id: string;
  name: string;
  /** One line for the picker, describing the look rather than any stat. */
  blurb: string;
}

/**
 * `ember` stays first and keeps the exact orange every sprite defaulted to,
 * so a player who never opens the picker sees the colour that always shipped.
 */
export const CHARACTERS: Character[] = [
  {
    id: 'ember',
    name: 'Ember',
    blurb: 'Street runner. Cap and pack.',
    body: '#ff6a1a',
    accent: '#2f3a2a',
    helmet: 'cap',
    hair: 'short',
    pack: true,
    bulk: 1,
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    blurb: 'Sealed armour. Heavy build.',
    body: '#3f6fa8',
    accent: '#d9e6f2',
    helmet: 'full',
    visor: '#7ce7ff',
    hair: 'none',
    bulk: 1.32,
  },
  {
    id: 'warden',
    name: 'Warden',
    blurb: 'Crested helm and cape.',
    body: '#c23b3b',
    accent: '#f0d58c',
    helmet: 'crest',
    cape: true,
    hair: 'none',
    bulk: 1.16,
  },
  {
    id: 'sprint',
    name: 'Sprint',
    blurb: 'Visor and a trailing scarf.',
    body: '#8bd13c',
    accent: '#2b3a16',
    helmet: 'none',
    visor: '#eaff9c',
    scarf: true,
    hair: 'short',
    bulk: 0.86,
  },
  {
    id: 'nova',
    name: 'Nova',
    blurb: 'Explorer. Ponytail and satchel.',
    body: '#6d4aff',
    accent: '#e9e2ff',
    helmet: 'none',
    hair: 'ponytail',
    pack: true,
    bulk: 0.94,
  },
];

export const DEFAULT_CHARACTER: Character = CHARACTERS[0]!;

export function characterById(id: string | null | undefined): Character {
  return CHARACTERS.find((character) => character.id === id) ?? DEFAULT_CHARACTER;
}

/**
 * The stored character, read synchronously.
 *
 * `useCharacter` resolves localStorage in an effect, to keep the server and
 * the first client render agreeing. But a 3D scene is built in an effect too,
 * and a child's effects run before its parent's — so a game reading the hook
 * builds its figure from the default before the stored pick has landed, and
 * every character looked like Ember however you picked. Anything that needs
 * the choice at build time reads it here instead.
 */
export function currentCharacter(): Character {
  return characterById(readCharacterId());
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
