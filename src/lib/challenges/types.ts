import type { StakeCurrency } from '@/types';

/**
 * The skill formats TeTe launches with. Kept deliberately short: a few formats
 * people actually play beats a long list nobody finishes.
 *
 * Every one of these is decided by skill. Nothing here resolves on chance.
 */
export const CHALLENGE_FORMATS = [
  { id: 'codm', name: 'CODM', tagline: 'Call of Duty Mobile.', category: 'Esports' },
  { id: 'freefire', name: 'Free Fire', tagline: 'Squad or solo.', category: 'Esports' },
  { id: 'efootball', name: 'eFootball', tagline: 'FIFA, eFootball, FC.', category: 'Esports' },
  { id: 'pubg', name: 'PUBG Mobile', tagline: 'Last one standing.', category: 'Esports' },
  { id: 'chess', name: 'Chess', tagline: 'Classic. Ruthless.', category: 'Mind' },
  { id: 'trivia', name: 'Trivia', tagline: 'Fastest correct wins.', category: 'Mind' },
  { id: 'arcade', name: 'Arcade', tagline: 'Beat their high score.', category: 'Arcade' },
  { id: 'custom', name: 'Custom', tagline: 'Name your own contest.', category: 'Open' },
] as const;

export type ChallengeFormatId = (typeof CHALLENGE_FORMATS)[number]['id'];

/** How the opponent is found. */
export type OpponentMode = 'direct' | 'open';

/**
 * A locally-saved challenge configuration.
 *
 * This is NOT an on-chain object and carries no escrow. It exists only in this
 * browser, it has never been sent to an opponent, and no funds are committed.
 * The UI labels it "draft — not funded" wherever it appears. Escrow, invites and
 * settlement arrive with Phase 2.
 */
export interface ChallengeDraft {
  id: string;
  format: ChallengeFormatId;
  /** Free text used when format is 'custom'. */
  customTitle?: string;
  currency: StakeCurrency;
  /** Stake per player, as the user typed it. Canonical units come later. */
  stake: number;
  opponentMode: OpponentMode;
  /** Opponent address when opponentMode is 'direct'. */
  opponent?: string;
  /** The roster nickname the opponent was chosen by, kept for display. */
  opponentUsername?: string;
  note?: string;
  createdAt: number;
}

export function formatById(id: ChallengeFormatId) {
  return CHALLENGE_FORMATS.find((format) => format.id === id) ?? CHALLENGE_FORMATS[0];
}

/** The title shown for a draft, honouring a custom name when present. */
export function draftTitle(draft: ChallengeDraft): string {
  if (draft.format === 'custom' && draft.customTitle?.trim()) return draft.customTitle.trim();
  return formatById(draft.format).name;
}
