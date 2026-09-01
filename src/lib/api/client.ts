/**
 * Talking to the TeTe API.
 *
 * Every write is signed. The client asks Nimiq Pay to sign a short message
 * naming the exact action and the moment it was issued, and sends that
 * alongside the request; the server checks the signature and that the address
 * being claimed is the one the key controls.
 *
 * Signing raises a native confirmation dialog, so each of these is a
 * deliberate, user-initiated action — never something that fires on a render.
 */
import { signingMessage } from '@/lib/api/message';
import { fundingMemo, type Challenge } from '@/lib/escrow/types';
import { sendNim, signMessage } from '@/lib/nimiq/provider';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parse<T>(response: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* Fall through to the status-based message below. */
  }
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

/** Sign an intent and return the envelope the API expects. */
export async function signIntent(address: string, intent: string) {
  const issuedAt = Date.now();
  const signed = await signMessage(signingMessage(intent, issuedAt));
  return { address, publicKey: signed.publicKey, signature: signed.signature, intent, issuedAt };
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  return parse<T>(response);
}

async function post<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parse<T>(response);
}

export interface DirectoryPlayer {
  username: string;
  address: string;
}

/** Resolve a username to an address. This is what removes the address prompt. */
export async function lookupPlayer(username: string): Promise<DirectoryPlayer | null> {
  const response = await fetch(`/api/players?u=${encodeURIComponent(username)}`);
  if (response.status === 404) return null;
  const body = await parse<{ player: DirectoryPlayer }>(response);
  return body.player;
}

/**
 * The name this address has claimed, if any. Lets a player see their own
 * handle on a device that has never claimed it, since the directory — not
 * local storage — is what opponents actually search.
 */
export async function myDirectoryName(address: string): Promise<DirectoryPlayer | null> {
  const response = await fetch(`/api/players?address=${encodeURIComponent(address)}`, {
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  const body = await parse<{ player: DirectoryPlayer }>(response);
  return body.player;
}

export async function claimUsername(address: string, username: string): Promise<DirectoryPlayer> {
  const auth = await signIntent(address, 'register');
  const body = await post<{ player: DirectoryPlayer }>('/api/players', { ...auth, username });
  return body.player;
}

export async function createChallenge(
  address: string,
  input: {
    format: string;
    title?: string;
    currency: string;
    /** Smallest unit — Luna for NIM. */
    stake: number;
    note?: string;
    /** Username, when aiming it at somebody. Omit for an open challenge. */
    opponent?: string;
  },
): Promise<Challenge> {
  const auth = await signIntent(address, 'create-challenge');
  const body = await post<{ challenge: Challenge }>('/api/challenges', { ...auth, ...input });
  return body.challenge;
}

/** The open board — challenges anyone can accept. */
export async function fetchOpenChallenges(): Promise<Challenge[]> {
  const body = await get<{ challenges: Challenge[] }>('/api/challenges');
  return body.challenges;
}

/** Every challenge this address is host or guest on. */
export async function fetchMyChallenges(address: string): Promise<Challenge[]> {
  const body = await get<{ challenges: Challenge[] }>(`/api/challenges?address=${encodeURIComponent(address)}`);
  return body.challenges;
}

export async function fetchChallenge(id: string): Promise<Challenge | null> {
  const response = await fetch(`/api/challenges/${id}`, { cache: 'no-store' });
  if (response.status === 404) return null;
  const body = await parse<{ challenge: Challenge }>(response);
  return body.challenge;
}

export async function challengeAction(
  address: string,
  id: string,
  action: 'accept' | 'confirm-funding' | 'report',
  extra: Record<string, unknown> = {},
): Promise<Challenge> {
  const auth = await signIntent(address, `${action}:${id}`);
  const body = await post<{ challenge: Challenge }>(`/api/challenges/${id}`, { ...auth, action, ...extra });
  return body.challenge;
}

/**
 * Fund a NIM challenge in one step: send the stake to the escrow address with
 * the challenge's memo attached, wait for it to land, then ask the server to
 * verify and record it.
 *
 * Only NIM is wired end to end. A USDT stake would need the server to watch
 * Polygon (or whichever chain) for an incoming ERC-20 transfer, which is not
 * built — see the note on the funding screen for USDT challenges.
 */
export async function fundNimChallenge(address: string, challenge: Challenge): Promise<Challenge> {
  if (challenge.currency !== 'NIM') {
    throw new ApiError('Only NIM challenges can be funded automatically right now.', 400);
  }
  if (!challenge.escrowAddress) {
    throw new ApiError('This challenge has no escrow address yet.', 409);
  }

  await sendNim(challenge.escrowAddress, challenge.stake, fundingMemo(challenge.id));

  // The transaction needs a few confirmations before the server will count it
  // (see MIN_CONFIRMATIONS in lib/server/treasury.ts) — poll rather than
  // asking once and reporting failure on a transaction that only just sent.
  const attempts = 10;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await challengeAction(address, challenge.id, 'confirm-funding');
    } catch (cause: unknown) {
      const last = attempt === attempts - 1;
      if (last || !(cause instanceof ApiError) || cause.status !== 409) throw cause;
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
  }
  throw new ApiError('Funding could not be confirmed. Try again in a moment.', 409);
}

export async function withdrawRewards(address: string) {
  const auth = await signIntent(address, 'withdraw');
  return post<{ sent: number; transaction: string }>('/api/withdraw', auth);
}

/**
 * Claim the reward for a finished arcade round. The server recomputes the
 * payout from the score itself — see lib/server/rewards.ts for the caps that
 * keep a fabricated score from being worth reporting.
 */
export async function claimGameReward(
  address: string,
  gameId: string,
  score: number,
): Promise<{ credited: number; balance: number }> {
  const auth = await signIntent(address, 'reward');
  return post<{ credited: number; balance: number }>('/api/rewards', { ...auth, gameId, score });
}

/**
 * What this deployment is configured to do.
 *
 * `store` and `escrow` are configured separately and fail separately: reading
 * the directory and the challenge board needs only a durable store, while
 * posting, funding and settling additionally need the treasury. The UI has to
 * know which of the two it has, or it ends up offering "Post challenge" on a
 * deployment whose POST will answer 503.
 *
 * Fails closed: an unreachable or older deployment reports neither.
 */
export interface BackendStatus {
  store: boolean;
  escrow: boolean;
}

export async function fetchStatus(): Promise<BackendStatus> {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) return { store: false, escrow: false };
    const body = (await response.json()) as Partial<BackendStatus>;
    return { store: body.store === true, escrow: body.escrow === true };
  } catch {
    return { store: false, escrow: false };
  }
}
