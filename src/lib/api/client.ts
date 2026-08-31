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
import { signMessage } from '@/lib/nimiq/provider';

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
) {
  const auth = await signIntent(address, 'create-challenge');
  return post<{ challenge: unknown }>('/api/challenges', { ...auth, ...input });
}

export async function challengeAction(
  address: string,
  id: string,
  action: 'accept' | 'confirm-funding' | 'report',
  extra: Record<string, unknown> = {},
) {
  const auth = await signIntent(address, `${action}:${id}`);
  return post<{ challenge: unknown }>(`/api/challenges/${id}`, { ...auth, action, ...extra });
}

export async function withdrawRewards(address: string) {
  const auth = await signIntent(address, 'withdraw');
  return post<{ sent: number; transaction: string }>('/api/withdraw', auth);
}

/** Is the backend configured on this deployment? */
export async function backendReady(): Promise<boolean> {
  try {
    const response = await fetch('/api/challenges');
    return response.status !== 503;
  } catch {
    return false;
  }
}
