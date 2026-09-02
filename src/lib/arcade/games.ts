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
  {
    id: 'invasion',
    name: 'Invasion',
    tagline: 'Thin the ranks. They get faster.',
    blurb: 'Drag to move, your cannon fires itself. The fewer left, the quicker they come.',
    unit: '',
    scoreLabel: 'Downed',
  },
  {
    id: 'rush',
    name: 'Rush',
    tagline: 'Three lanes. No brakes.',
    blurb: 'Swipe across to switch lanes, up to jump, down to roll under.',
    unit: 'm',
    scoreLabel: 'Distance',
  },
  {
    id: 'pitch',
    name: 'Pitch',
    tagline: 'Bend it round the wall.',
    blurb: 'Drag back and let go. Curve the shot around the wall and past the keeper.',
    unit: '',
    scoreLabel: 'Goals',
  },
  {
    id: 'overheat',
    name: 'Overheat',
    tagline: 'Throttle hard. Land flat.',
    blurb: 'Hold to accelerate and watch the temperature. In the air, lean to level your landing.',
    unit: 'm',
    scoreLabel: 'Distance',
  },
  {
    id: 'alley',
    name: 'Alley',
    tagline: 'Pick up whatever is lying around.',
    blurb: 'Drag to move, tap to strike. Stand on a crate or a pipe and tap to arm yourself.',
    unit: '',
    scoreLabel: 'Floored',
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

