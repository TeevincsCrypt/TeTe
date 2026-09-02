/**
 * A note that this device has already paid a stake.
 *
 * Confirming a stake means waiting for the chain, and that wait can outlast
 * the screen: the poll gives up, the player sees "no confirmed payment found
 * yet", and the obvious next move is to press the only button there — which
 * used to send the stake a second time. The money had already left; only the
 * confirmation had not caught up.
 *
 * So the send is recorded the moment it is made. While a record exists, the
 * funding screen offers to check again rather than to pay again.
 */
const KEY = 'tete.funding-sent.v1';

export interface SentStake {
  challengeId: string;
  hash: string;
  at: number;
}

function readAll(): Record<string, SentStake> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, SentStake>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, SentStake>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* Storage unavailable. The worst case is the old behaviour: offering to
       send again. The server still refuses to count one payment twice. */
  }
}

export function recordSentStake(challengeId: string, hash: string): void {
  const all = readAll();
  all[challengeId] = { challengeId, hash, at: Date.now() };
  writeAll(all);
}

export function readSentStake(challengeId: string): SentStake | null {
  return readAll()[challengeId] ?? null;
}

/** Once the server has recorded the stake, the note has done its job. */
export function clearSentStake(challengeId: string): void {
  const all = readAll();
  if (!(challengeId in all)) return;
  delete all[challengeId];
  writeAll(all);
}
