/**
 * The arcade line-up.
 *
 * These are original games written for TeTe. They sit in well-known arcade
 * *genres* — road-crossing, one-touch driving, swipe-to-slice — because genre
 * mechanics are not anybody's property, but no name, character, artwork or
 * level from an existing commercial title is reproduced here.
 *
 * Every one is decided by the player's own input. Nothing pays out on chance,
 * which is what lets the arcade sit beside staked challenges without turning
 * into a gambling surface.
 */
export const GAMES = [
  {
    id: 'crossing',
    name: 'Crossing',
    tagline: 'Hop the traffic. Do not stop.',
    blurb: 'Tap the sides to shuffle across, the middle to hop forward.',
    unit: '',
    scoreLabel: 'Rows',
  },
  {
    id: 'drift',
    name: 'Drift',
    tagline: 'One touch. Hold your line.',
    blurb: 'Hold to steer right, release to fall left. Stay on the road.',
    unit: 'm',
    scoreLabel: 'Distance',
  },
  {
    id: 'slice',
    name: 'Slice',
    tagline: 'Swipe clean. Miss nothing.',
    blurb: 'Cut every target before it drops. Leave the black ones alone.',
    unit: '',
    scoreLabel: 'Score',
  },
] as const;

export type GameId = (typeof GAMES)[number]['id'];

export function gameById(id: GameId) {
  return GAMES.find((game) => game.id === id) ?? GAMES[0];
}

/** Every game scores higher-is-better, so a new best is a plain comparison. */
export function isBetter(_id: GameId, next: number, best: number | undefined): boolean {
  return best === undefined || next > best;
}

/** XP earned for a run. Tuned per game so the three pay out comparably. */
export function xpForScore(id: GameId, score: number): number {
  const rate = id === 'drift' ? 0.35 : id === 'slice' ? 1.6 : 2.2;
  return Math.max(1, Math.round(score * rate));
}
