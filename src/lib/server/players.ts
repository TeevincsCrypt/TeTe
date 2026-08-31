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
}

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
