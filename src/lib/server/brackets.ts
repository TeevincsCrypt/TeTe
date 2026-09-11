import 'server-only';

import {
  isFull,
  matchesInRound,
  pairRound0,
  roundComplete,
  roundCount,
  type Bracket,
  type BracketMatch,
  type BracketSize,
} from '@/lib/bracket/types';
import { formatById, type ChallengeFormatId } from '@/lib/challenges/types';
import type { Challenge } from '@/lib/escrow/types';
import { createId } from '@/lib/ids';
import { compactAddress } from '@/lib/nimiq/address';
import type { StakeCurrency } from '@/types';

import { createDirectMatch } from './challenges';
import { get, list, push, set } from './store';

/**
 * Tournament persistence and the orchestration that turns one bracket into a
 * sequence of ordinary Challenge records.
 *
 * See lib/bracket/types.ts for why a bracket is not a new escrow primitive:
 * every match here is created through createDirectMatch, the exact same
 * constructor a normal challenge uses — just pre-accepted, since a bracket
 * already knows both players before the match exists.
 */
const DAY = 24 * 60 * 60 * 1000;

const bracketKey = (id: string) => `bracket:${id}`;
const OPEN_BRACKETS = 'brackets:open';
const bracketPlayerList = (address: string) => `brackets:player:${compactAddress(address)}`;

export async function readBracket(id: string): Promise<Bracket | null> {
  return get<Bracket>(bracketKey(id));
}

async function save(bracket: Bracket): Promise<Bracket> {
  bracket.updatedAt = Date.now();
  await set(bracketKey(bracket.id), bracket);
  return bracket;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

const fail = (error: string, status = 400): Outcome<never> => ({ ok: false, error, status });

export async function createBracket(input: {
  id: string;
  format: ChallengeFormatId;
  title?: string;
  currency: StakeCurrency;
  stake: number;
  size: BracketSize;
  host: { address: string; username?: string };
}): Promise<Bracket> {
  const bracket: Bracket = {
    id: input.id,
    format: input.format,
    title: input.title,
    currency: input.currency,
    stake: input.stake,
    size: input.size,
    state: 'open',
    entrants: [{ address: input.host.address, username: input.host.username, joinedAt: Date.now() }],
    matches: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await save(bracket);
  await push(OPEN_BRACKETS, bracket.id);
  await push(bracketPlayerList(input.host.address), bracket.id);
  return bracket;
}

/** Tournaments still filling up — the open board. */
export async function listOpenBrackets(limit = 40): Promise<Bracket[]> {
  const ids = await list(OPEN_BRACKETS, limit);
  const found = await Promise.all(ids.map(readBracket));
  return found.filter((b): b is Bracket => b !== null && b.state === 'open');
}

/** Every tournament this address has entered, in any state. */
export async function bracketsFor(address: string, limit = 40): Promise<Bracket[]> {
  const ids = await list(bracketPlayerList(address), limit);
  const found = await Promise.all(ids.map(readBracket));
  return found.filter((b): b is Bracket => b !== null);
}

/**
 * Is this the last round of its bracket — the one whose winner is actually
 * paid, rather than carrying the pot into another round?
 *
 * Called from challenges.ts's payWinner before it decides whether to touch
 * the treasury at all, so a missing bracket fails safe toward `true`: paying
 * the immediate winner for real is always recoverable, a pot stuck "carried"
 * against a bracket record that cannot be found is not.
 */
export async function isFinalBracketRound(bracketId: string, round: number): Promise<boolean> {
  const bracket = await readBracket(bracketId);
  if (!bracket) return true;
  return round === roundCount(bracket.size) - 1;
}

function shuffled<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = next[i] as T;
    next[i] = next[j] as T;
    next[j] = temp;
  }
  return next;
}

/**
 * Random-draw the field and create every round-0 match at once.
 *
 * A tournament decided entirely by skill still opens with a random draw —
 * nobody picks their own first opponent — so entrants are reshuffled here,
 * once, the moment the field is full.
 */
async function startBracket(bracket: Bracket): Promise<Bracket> {
  bracket.entrants = shuffled(bracket.entrants);

  const expiresAt = Date.now() + 7 * DAY;
  const title = bracket.title ?? `${formatById(bracket.format).name} tournament`;
  const matches: BracketMatch[] = [];
  for (const { slotA, slotB } of pairRound0(bracket.size)) {
    const a = bracket.entrants[slotA];
    const b = bracket.entrants[slotB];
    // Invariant: pairRound0 only ever emits indices within entrants, which is
    // already full by the time this runs.
    if (!a || !b) continue;
    const challenge = await createDirectMatch({
      id: createId(),
      format: bracket.format,
      title,
      currency: bracket.currency,
      stake: bracket.stake,
      host: { address: a.address, username: a.username },
      guest: { address: b.address, username: b.username },
      createdAt: Date.now(),
      expiresAt,
      bracketId: bracket.id,
      bracketRound: 0,
    });
    matches.push({ round: 0, slotA, slotB, challengeId: challenge.id });
  }
  bracket.matches = matches;
  bracket.state = 'live';
  return save(bracket);
}

/**
 * Join an open tournament. Starts it automatically the instant the field
 * fills — nobody has to come back and press a separate "start" button, and a
 * full bracket sitting open with nothing happening helps no one.
 */
export async function joinBracket(id: string, address: string, username?: string): Promise<Outcome<Bracket>> {
  const bracket = await readBracket(id);
  if (!bracket) return fail('No such tournament.', 404);
  if (bracket.state !== 'open') {
    return fail(`This tournament is already ${bracket.state === 'live' ? 'in progress' : 'complete'}.`, 409);
  }
  if (bracket.entrants.some((entrant) => compactAddress(entrant.address) === compactAddress(address))) {
    return fail("You're already in this tournament.", 409);
  }
  if (isFull(bracket)) return fail('This tournament is already full.', 409);

  bracket.entrants.push({ address, username, joinedAt: Date.now() });
  await push(bracketPlayerList(address), bracket.id);

  const value = isFull(bracket) ? await startBracket(bracket) : await save(bracket);
  return { ok: true, value };
}

/**
 * Notice a bracket match's result and, once its whole round has settled,
 * either crown a champion or create the next round's matches.
 *
 * Best-effort by design, same as the other hooks payWinner calls: a bracket
 * that fails to advance still leaves the match it was watching correctly
 * paid out, which is the part that actually moves money.
 */
export async function advanceBracket(challenge: Challenge): Promise<void> {
  if (!challenge.bracketId || !challenge.winner) return;
  try {
    const bracket = await readBracket(challenge.bracketId);
    if (!bracket) return;

    const match = bracket.matches.find((m) => m.challengeId === challenge.id);
    if (!match || match.winnerSlot !== undefined) return;
    match.winnerSlot = challenge.winner === 'host' ? match.slotA : match.slotB;

    if (!roundComplete(bracket, match.round)) {
      await save(bracket);
      return;
    }

    if (match.round === roundCount(bracket.size) - 1) {
      bracket.championSlot = match.winnerSlot;
      bracket.state = 'complete';
      await save(bracket);
      return;
    }

    const finished = matchesInRound(bracket, match.round);
    const nextRound = match.round + 1;
    const expiresAt = Date.now() + 7 * DAY;
    const title = bracket.title ?? `${formatById(bracket.format).name} tournament`;
    // Both sides arriving here won their previous round, so both already
    // carry a pot of exactly bracket.stake * 2^round — that is what "stake"
    // means for a round beyond the first, and why neither side has anything
    // left to send: createDirectMatch marks them funded with it directly.
    const carriedStake = bracket.stake * 2 ** nextRound;
    for (let i = 0; i < finished.length; i += 2) {
      const slotA = finished[i]?.winnerSlot;
      const slotB = finished[i + 1]?.winnerSlot;
      if (slotA === undefined || slotB === undefined) continue;
      const a = bracket.entrants[slotA];
      const b = bracket.entrants[slotB];
      if (!a || !b) continue;
      const nextChallenge = await createDirectMatch({
        id: createId(),
        format: bracket.format,
        title,
        currency: bracket.currency,
        stake: carriedStake,
        host: { address: a.address, username: a.username },
        guest: { address: b.address, username: b.username },
        createdAt: Date.now(),
        expiresAt,
        bracketId: bracket.id,
        bracketRound: nextRound,
        carried: true,
      });
      bracket.matches.push({ round: nextRound, slotA, slotB, challengeId: nextChallenge.id });
    }
    await save(bracket);
  } catch {
    /* Best-effort, same as maybeCreditReferral — never blocks a real settlement. */
  }
}
