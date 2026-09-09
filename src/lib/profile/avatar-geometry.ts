/**
 * The pure math behind a generated avatar: which palette, which shape,
 * which rotation. Split out of `Avatar` so a second renderer — the PnL card,
 * which draws onto a canvas rather than mounting SVG — can reproduce exactly
 * the same face for the same address without a second copy of this logic.
 */
import { hashString } from '@/lib/ids';

/** Drawn from the app palette so generated faces stay on-brand. */
export const AVATAR_PALETTES = [
  ['#ff6a1a', '#17120e'],
  ['#17120e', '#ff6a1a'],
  ['#6d4aff', '#f7f2ed'],
  ['#9a6600', '#f7f2ed'],
  ['#15803d', '#f7f2ed'],
  ['#cc3118', '#f7f2ed'],
] as const;

export interface AvatarGeometry {
  bg: string;
  fg: string;
  rotation: number;
  variant: 0 | 1 | 2 | 3;
}

export function avatarGeometry(address: string | null, seed?: number | null): AvatarGeometry {
  const hash = seed === null || seed === undefined ? hashString(address ?? 'tete') : seed;
  const palette = AVATAR_PALETTES[hash % AVATAR_PALETTES.length] ?? AVATAR_PALETTES[0];
  const [bg, fg] = palette;
  return { bg, fg, rotation: hash % 4, variant: ((hash >> 3) % 4) as 0 | 1 | 2 | 3 };
}
