/**
 * The arcade line-up.
 *
 * Every game here is decided purely by the player's own skill — reaction speed,
 * recall, arithmetic. Nothing rolls a die or pays out on chance. That is a hard
 * product rule for TeTe, not a stylistic one, and it is why the arcade can sit
 * next to staked challenges without becoming a gambling surface.
 */
export const GAMES = [
  {
    id: 'reflex',
    name: 'Reflex',
    tagline: 'Tap the moment it flips.',
    icon: '⚡',
    /** Reaction time in ms — lower is better. */
    lowerIsBetter: true,
    unit: 'ms',
  },
  {
    id: 'memory',
    name: 'Recall',
    tagline: 'Repeat the pattern.',
    icon: '🧠',
    lowerIsBetter: false,
    unit: 'lvl',
  },
  {
    id: 'sprint',
    name: 'Sprint',
    tagline: 'Sums against the clock.',
    icon: '🔢',
    lowerIsBetter: false,
    unit: 'pts',
  },
] as const;

export type GameId = (typeof GAMES)[number]['id'];

export function gameById(id: GameId) {
  return GAMES.find((game) => game.id === id) ?? GAMES[0];
}

/** Is `next` an improvement on `best` for this game? */
export function isBetter(id: GameId, next: number, best: number | undefined): boolean {
  if (best === undefined) return true;
  return gameById(id).lowerIsBetter ? next < best : next > best;
}
