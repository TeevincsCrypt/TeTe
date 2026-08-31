/**
 * Challenge links.
 *
 * A challenge is encoded into the URL itself, which is what lets one player
 * send it to another with no backend in the middle: the link travels through
 * whatever messenger they already use, and the recipient opens it inside Nimiq
 * Pay. That is real peer-to-peer reach today, rather than a public board that
 * would need a server to hold it.
 *
 * The link carries terms only. It moves no money and commits nobody — funding
 * needs escrow, which is still ahead.
 */
import type { ChallengeDraft, ChallengeFormatId, OpponentMode } from './types';
import type { StakeCurrency } from '@/types';

export interface SharedChallenge {
  format: ChallengeFormatId;
  title?: string;
  currency: StakeCurrency;
  stake: number;
  mode: OpponentMode;
  from?: string;
  fromName?: string;
  note?: string;
}

export function encodeChallenge(draft: ChallengeDraft, fromAddress: string | null, fromName: string): string {
  const params = new URLSearchParams();
  params.set('f', draft.format);
  params.set('c', draft.currency);
  params.set('s', String(draft.stake));
  params.set('m', draft.opponentMode);
  if (draft.customTitle) params.set('t', draft.customTitle);
  if (draft.note) params.set('n', draft.note);
  if (fromAddress) params.set('a', fromAddress.replace(/\s+/g, ''));
  if (fromName) params.set('u', fromName);
  return params.toString();
}

export function decodeChallenge(params: URLSearchParams): SharedChallenge | null {
  const format = params.get('f');
  const currency = params.get('c');
  const stake = Number.parseFloat(params.get('s') ?? '');

  if (!format || (currency !== 'NIM' && currency !== 'USDT')) return null;
  if (!Number.isFinite(stake) || stake <= 0) return null;

  return {
    format: format as ChallengeFormatId,
    currency,
    stake,
    mode: params.get('m') === 'direct' ? 'direct' : 'open',
    title: params.get('t') ?? undefined,
    note: params.get('n') ?? undefined,
    from: params.get('a') ?? undefined,
    fromName: params.get('u') ?? undefined,
  };
}

/** Absolute link to hand to another player. */
export function challengeUrl(query: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/c?${query}`;
}
