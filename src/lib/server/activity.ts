import 'server-only';

import { compactAddress } from '@/lib/nimiq/address';

import { get, list, push, set } from './store';

/**
 * What happened to a player's balance, kept by the server.
 *
 * The device already keeps a list of rounds it played, but that list can only
 * ever know about things this phone did. Anything that happens *to* a player —
 * a tip arriving, a stake settling — is invisible to it, which is why being
 * tipped showed up nowhere: the money moved, and the only record of it was a
 * number changing.
 *
 * So each side of a movement is recorded here, against the address it
 * concerns, and every device reading that address sees the same history.
 */
export type ActivityKind =
  | 'tip-in'
  | 'tip-out'
  | 'reward'
  | 'check-in'
  | 'withdrawal'
  | 'payout';

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  /** Signed: positive is money in, negative is money out. Luna. */
  luna: number;
  /** Short human label, e.g. "@rival" or "Crossing". */
  label: string;
  at: number;
  /** Where tapping it should lead, when there is somewhere useful. */
  href?: string;
}

const feedKey = (address: string) => `activity:${compactAddress(address)}`;
const entryKey = (address: string, id: string) => `activity:${compactAddress(address)}:${id}`;

const CAP = 100;

/**
 * Append one entry to an address's feed.
 *
 * Never throws into the caller's path: an activity line is a record of
 * something that already happened, so failing to write it must not undo the
 * thing itself. A tip that moved real NIM is not rolled back because its
 * history entry could not be stored.
 */
export async function recordActivity(
  address: string,
  entry: Omit<ActivityEntry, 'id' | 'at'> & { id?: string; at?: number },
): Promise<void> {
  try {
    const id = entry.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const full: ActivityEntry = { ...entry, id, at: entry.at ?? Date.now() };
    await set(entryKey(address, id), full);
    await push(feedKey(address), id, CAP);
  } catch {
    /* History is best-effort; the money movement it describes is not. */
  }
}

export async function readActivity(address: string, limit = 50): Promise<ActivityEntry[]> {
  const ids = await list(feedKey(address), limit);
  const found = await Promise.all(ids.map((id) => get<ActivityEntry>(entryKey(address, id))));
  return found
    .filter((entry): entry is ActivityEntry => entry !== null)
    .sort((a, b) => b.at - a.at);
}
