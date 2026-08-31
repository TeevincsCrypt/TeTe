/**
 * The player's roster — opponents they have saved, so a challenge can be
 * addressed by username instead of a 36-character address.
 *
 * A username here is a nickname THIS player assigned to an address on THIS
 * device — a shortcut, not an identity. It is not what anyone else sees.
 *
 * The real handles live in the server directory (`lib/server/players.ts`),
 * where a name is claimed by signing with the address it points at and is
 * resolvable by every player. Create resolves typed names through that
 * directory, so nobody needs an address to challenge somebody. This roster
 * survives as a local convenience in front of it.
 */
import { createId } from '@/lib/ids';
import { compactAddress, isNimiqAddressShape } from '@/lib/nimiq/address';

const KEY = 'tete.roster.v1';

export interface RosterPlayer {
  id: string;
  /** Display form, as the owner typed it. */
  username: string;
  /** Nimiq address, stored compact so comparisons are stable. */
  address: string;
  addedAt: number;
}

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;

/** Case-insensitive key used for uniqueness checks and lookup. */
export function usernameKey(username: string): string {
  return username.trim().toLowerCase();
}

export function readRoster(): RosterPlayer[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isPlayer)
      .sort((a, b) => a.username.localeCompare(b.username));
  } catch {
    return [];
  }
}

export type AddResult =
  | { ok: true; player: RosterPlayer }
  | { ok: false; error: string };

/**
 * Add a player. Rejects a malformed username or address, a username already in
 * the roster, and an address already saved under another name — so one person
 * cannot end up on the roster twice under two handles.
 */
export function addPlayer(username: string, address: string): AddResult {
  const name = username.trim();
  const compact = compactAddress(address);

  if (!USERNAME_PATTERN.test(name)) {
    return { ok: false, error: 'Usernames are 3–16 letters, numbers or underscores.' };
  }
  if (!isNimiqAddressShape(compact)) {
    return { ok: false, error: 'That does not look like a Nimiq address.' };
  }

  const roster = readRoster();
  if (roster.some((p) => usernameKey(p.username) === usernameKey(name))) {
    return { ok: false, error: `You already have a player called ${name}.` };
  }
  const clash = roster.find((p) => p.address === compact);
  if (clash) {
    return { ok: false, error: `That address is already saved as ${clash.username}.` };
  }

  const player: RosterPlayer = { id: createId(), username: name, address: compact, addedAt: Date.now() };
  write([player, ...roster]);
  return { ok: true, player };
}

export function removePlayer(id: string): RosterPlayer[] {
  const next = readRoster().filter((player) => player.id !== id);
  write(next);
  return next;
}

/** Look a saved player up by name. Case-insensitive. */
export function findByUsername(username: string): RosterPlayer | undefined {
  const key = usernameKey(username);
  return readRoster().find((player) => usernameKey(player.username) === key);
}

function write(players: RosterPlayer[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(players));
    window.dispatchEvent(new CustomEvent('tete:roster-changed'));
  } catch {
    /* Storage unavailable. The player is simply not remembered. */
  }
}

function isPlayer(value: unknown): value is RosterPlayer {
  if (typeof value !== 'object' || value === null) return false;
  const player = value as Partial<RosterPlayer>;
  return (
    typeof player.id === 'string' &&
    typeof player.username === 'string' &&
    typeof player.address === 'string'
  );
}
