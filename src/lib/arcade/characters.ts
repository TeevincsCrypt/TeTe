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
  /** A lit band across the eyes. Drawn with or without a helmet. */
  visor?: string;
  cape?: boolean;
  pack?: boolean;
  scarf?: boolean;
  hair?: 'none' | 'short' | 'ponytail';
  /** Build, as a multiplier on torso and limb thickness. 1 is standard. */
  bulk?: number;
  /** Lit circuitry down the suit — chest, arms and shins. */
  glow?: string;
  /** A breather over the lower face. */
  mask?: boolean;
  /** Bladed metal lower legs in place of shins. */
  prosthetic?: boolean;
  /** A muzzle and ears, for a character who is not human. */
  feline?: boolean;
  tail?: boolean;
  /** Spotted pelt, as a colour to blot over the body. Implies fur. */
  spots?: string;
}

export interface Character extends Look {
  id: string;
  name: string;
  /** One line for the picker, describing the look rather than any stat. */
  blurb: string;
}

/**
 * The roster. Every design is original — these are not, and do not resemble,
 * any existing game's characters, which is the same rule the games and the
 * cover art hold to.
 *
 * The ids changed when the roster did, so a player who had picked one of the
 * old colour swatches has a stored id that no longer exists. `characterById`
 * already falls back to the default for anything it does not recognise, so
 * that resolves to Tasha on the next load rather than needing a migration.
 */
export const CHARACTERS: Character[] = [
  {
    id: 'tasha',
    name: 'Tasha',
    blurb: 'Visor and lit circuitry.',
    body: '#1b2a44',
    accent: '#33415c',
    glow: '#35d6ff',
    visor: '#7fe9ff',
    hair: 'ponytail',
    bulk: 0.92,
  },
  {
    id: 'jax',
    name: 'Jax',
    blurb: 'Breather mask. Blade legs.',
    body: '#6b7280',
    accent: '#343a44',
    mask: true,
    prosthetic: true,
    hair: 'short',
    bulk: 1.08,
  },
  {
    id: 'kaylen',
    name: 'Kaylen',
    blurb: 'Dark suit, teal circuitry.',
    body: '#14161c',
    accent: '#252a34',
    glow: '#2ee6c4',
    hair: 'short',
    bulk: 1,
  },
  {
    id: 'fang',
    name: 'Fang',
    blurb: 'Spotted pelt. Muzzle and tail.',
    body: '#d9a441',
    accent: '#2f6b3a',
    spots: '#5a3b16',
    feline: true,
    tail: true,
    hair: 'none',
    bulk: 1.14,
  },
  {
    id: 'aria',
    name: 'Aria',
    blurb: 'White and gold, gold visor.',
    body: '#f1f1ee',
    accent: '#d8b143',
    visor: '#ffd766',
    hair: 'ponytail',
    bulk: 0.9,
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
