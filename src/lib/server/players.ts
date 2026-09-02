import 'server-only';

import { USERNAME_PATTERN, usernameKey } from '@/lib/roster/roster';

import { get, set, setIfAbsent } from './store';

/**
 * The username directory.
 *
 * This is what makes "challenge @rival" work without anybody typing an
 * address. A name is claimed by proving control of the address it points at,
 * and claims are first-come: `setIfAbsent` is used so two simultaneous
 * registrations cannot both win the same handle.
 */
export interface PlayerRecord {
  username: string;
  address: string;
  registeredAt: number;
  /**
   * How this player looks to everybody else.
   *
   * These used to live only in the owner's localStorage, which meant the face
   * they had chosen was the one face nobody else could see: tag them in a
   * challenge and you got the generated default instead of them. A look is
   * part of an identity other people look up, so it belongs in the directory.
   */
  avatarSeed?: number | null;
  /** A small data URL, capped by MAX_PHOTO_BYTES on the way in. */
  photo?: string | null;
}

/** Hard ceiling on a stored photo, matching the client's own cap. */
export const MAX_PHOTO_BYTES = 120_000;

const nameKey = (username: string) => `player:name:${usernameKey(username)}`;
// Addresses arrive both spaced (`listAccounts()`, the signature check) and
// compact (stored records), so the key is normalised both ways — otherwise the
// same player reads back as two different people depending on the caller.
const addrKey = (address: string) => `player:addr:${address.replace(/\s+/g, '').toUpperCase()}`;

export async function lookupUsername(username: string): Promise<PlayerRecord | null> {
  if (!USERNAME_PATTERN.test(username.trim())) return null;
  return get<PlayerRecord>(nameKey(username));
}

export async function lookupAddress(address: string): Promise<PlayerRecord | null> {
  return get<PlayerRecord>(addrKey(address));
}

export type ClaimResult =
  | { ok: true; player: PlayerRecord }
  | { ok: false; error: string };

/**
 * Claim a username for a verified address.
 *
 * Re-claiming the same name from the same address is a no-op rather than an
 * error, so a client retrying after a dropped response does not get a
 * confusing failure. Changing name releases the previous one.
 */
export async function claimUsername(username: string, address: string): Promise<ClaimResult> {
  const name = username.trim();
  if (!USERNAME_PATTERN.test(name)) {
    return { ok: false, error: 'Usernames are 3–16 letters, numbers or underscores.' };
  }

  const existing = await get<PlayerRecord>(nameKey(name));
  if (existing && existing.address !== address) {
    return { ok: false, error: `@${name} is already taken.` };
  }

  const record: PlayerRecord = { username: name, address, registeredAt: Date.now() };

  if (!existing) {
    const won = await setIfAbsent(nameKey(name), record);
    if (!won) return { ok: false, error: `@${name} was just taken.` };
  }

  // Release any previous handle this address held.
  const previous = await get<PlayerRecord>(addrKey(address));
  if (previous && usernameKey(previous.username) !== usernameKey(name)) {
    await set(nameKey(previous.username), null);
  }

  await set(addrKey(address), record);
  return { ok: true, player: record };
}

export type LookResult =
  | { ok: true; player: PlayerRecord }
  | { ok: false; error: string };

/**
 * Update how a player appears to others.
 *
 * Only for an address that has already claimed a name — the directory is
 * keyed by name, and a look with nobody to attach it to has nowhere to live.
 * The caller must already have verified the signature over this address.
 */
export async function saveLook(
  address: string,
  look: { avatarSeed?: number | null; photo?: string | null },
): Promise<LookResult> {
  const existing = await get<PlayerRecord>(addrKey(address));
  if (!existing) {
    return { ok: false, error: 'Claim a username before setting a picture.' };
  }

  if (typeof look.photo === 'string' && look.photo.length > MAX_PHOTO_BYTES) {
    return { ok: false, error: 'That picture is too large.' };
  }
  if (
    look.avatarSeed !== undefined &&
    look.avatarSeed !== null &&
    !Number.isInteger(look.avatarSeed)
  ) {
    return { ok: false, error: 'That avatar is not valid.' };
  }

  const next: PlayerRecord = {
    ...existing,
    // `undefined` means "leave alone"; `null` means "clear it".
    ...(look.avatarSeed !== undefined ? { avatarSeed: look.avatarSeed } : {}),
    ...(look.photo !== undefined ? { photo: look.photo } : {}),
  };

  // Written to both keys, since either can be the one a viewer looks up.
  await set(addrKey(address), next);
  await set(nameKey(next.username), next);
  return { ok: true, player: next };
}
