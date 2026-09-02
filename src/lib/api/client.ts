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
import { clearSentStake, recordSentStake } from '@/lib/challenges/funding-record';
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
  /** The look they chose, so tagging them shows their face and not a default. */
  avatarSeed?: number | null;
  photo?: string | null;
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

/**
 * Publish how you look, so other players see it when they tag you.
 *
 * Signed, because it writes to a public identity. Omit a field to leave it
 * alone; pass null to clear it.
 */
export async function saveProfileLook(
  address: string,
  look: { avatarSeed?: number | null; photo?: string | null },
): Promise<DirectoryPlayer> {
  const auth = await signIntent(address, 'profile');
  const body = await post<{ player: DirectoryPlayer }>('/api/players', {
    ...auth,
    action: 'look',
    ...look,
  });
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

/** What the chain shows for each side's stake, when one is still missing. */
export interface FundingView {
  host?: string;
  guest?: string;
}

/**
 * A challenge plus what the server can see of any stake it is still waiting
 * on. Same request as `fetchChallenge` — the reason comes back with the
 * challenge so a player never has to ask for it.
 */
export async function fetchChallengeWithFunding(
  id: string,
): Promise<{ challenge: Challenge; funding: FundingView } | null> {
  const response = await fetch(`/api/challenges/${id}`, { cache: 'no-store' });
  if (response.status === 404) return null;
  const body = await parse<{ challenge: Challenge; funding?: FundingView }>(response);
  return { challenge: body.challenge, funding: body.funding ?? {} };
}

export async function challengeAction(
  address: string,
  id: string,
  action: 'accept' | 'confirm-funding' | 'report' | 'cancel',
  extra: Record<string, unknown> = {},
): Promise<Challenge> {
  const auth = await signIntent(address, `${action}:${id}`);
  return sendChallengeAction(id, auth, action, extra);
}

/**
 * Post an already-signed challenge action.
 *
 * Split out from `challengeAction` so a caller that has to retry — funding
 * waits for confirmations — can reuse one signature instead of raising a
 * fresh Nimiq Pay dialog on every attempt. The signature stays valid for five
 * minutes (MAX_AGE_MS in lib/server/auth.ts), which comfortably covers a
 * retry loop measured in seconds.
 */
async function sendChallengeAction(
  id: string,
  auth: Awaited<ReturnType<typeof signIntent>>,
  action: 'accept' | 'confirm-funding' | 'report' | 'cancel',
  extra: Record<string, unknown> = {},
): Promise<Challenge> {
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
export async function sendStake(challenge: Challenge): Promise<string> {
  if (challenge.currency !== 'NIM') {
    throw new ApiError('Only NIM challenges can be funded automatically right now.', 400);
  }
  if (!challenge.escrowAddress) {
    throw new ApiError('This challenge has no escrow address yet.', 409);
  }

  const hash = await sendNim(challenge.escrowAddress, challenge.stake, fundingMemo(challenge.id));
  // Written before anything else can fail. If the confirmation never lands —
  // or the screen is closed mid-wait — this is what stops the next tap paying
  // a second time for a stake that has already gone.
  recordSentStake(challenge.id, hash);
  return hash;
}

/**
 * One attempt to have the server find and record an already-sent stake.
 *
 * Deliberately a *single* attempt. The previous version looped for two and a
 * half minutes behind a spinner, which is indistinguishable from a hang: the
 * money had left, the screen said nothing about that, and the only visible
 * state was a button that would not stop loading. Callers now drive their own
 * retries and can say what is happening between them.
 *
 * Returns null when the payment is not visible yet, with `reason` explaining
 * which kind of "not yet" it is. Only a genuine failure throws.
 */
export async function tryConfirmStake(
  challengeId: string,
  auth: Awaited<ReturnType<typeof signIntent>>,
): Promise<{ challenge: Challenge } | { challenge: null; reason: string }> {
  try {
    const challenge = await sendChallengeAction(challengeId, auth, 'confirm-funding');
    clearSentStake(challengeId);
    return { challenge };
  } catch (cause: unknown) {
    if (cause instanceof ApiError && cause.status === 409) {
      return { challenge: null, reason: cause.message };
    }
    throw cause;
  }
}

/** A signature for confirming this stake, good for five minutes of retries. */
export function signConfirmFunding(address: string, challengeId: string) {
  return signIntent(address, `confirm-funding:${challengeId}`);
}

export async function withdrawRewards(address: string) {
  const auth = await signIntent(address, 'withdraw');
  return post<{ sent: number; transaction: string }>('/api/withdraw', auth);
}

/**
 * On-chain NIM balance, read through TeTe's server so the node's credentials
 * never reach the browser. Null when this deployment has no node configured.
 */
export async function fetchChainBalance(address: string): Promise<number | null> {
  try {
    const response = await fetch(`/api/balance?address=${encodeURIComponent(address)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { balance?: number };
    return typeof body.balance === 'number' ? body.balance : null;
  } catch {
    return null;
  }
}

/** Earned-but-not-withdrawn rewards, as the server has them. */
export async function fetchRewardBalance(address: string): Promise<number | null> {
  try {
    const response = await fetch(`/api/rewards?address=${encodeURIComponent(address)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { balance?: number };
    return typeof body.balance === 'number' ? body.balance : null;
  } catch {
    return null;
  }
}

/**
 * Credit a finished arcade round. Unsigned on purpose — this fires the moment
 * a round ends, and signing would raise a wallet dialog after every game; the
 * signature that matters is on withdrawing, not on crediting. See the note on
 * /api/rewards. The server recomputes the payout itself from the score and
 * coins, within the caps in lib/server/rewards.ts.
 */
export async function claimGameReward(
  address: string,
  gameId: string,
  score: number,
  coins: number,
  hazards = 0,
): Promise<{ credited: number; balance: number }> {
  return post<{ credited: number; balance: number }>('/api/rewards', {
    address,
    gameId,
    score,
    coins,
    hazards,
  });
}

export interface StreakState {
  streak: number;
  claimedToday: boolean;
  /** What a claim pays, in Luna. */
  reward: number;
}

/** The server's view of the check-in — the one that pays. Null when unconfigured. */
export async function fetchStreak(address: string): Promise<StreakState | null> {
  try {
    const response = await fetch(`/api/streak?address=${encodeURIComponent(address)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as StreakState;
  } catch {
    return null;
  }
}

/**
 * Claim today's check-in into the withdrawable balance. Unsigned for the same
 * reason a finished round is — see /api/streak.
 */
export async function claimStreak(
  address: string,
): Promise<{ credited: number; balance: number; streak: number }> {
  return post<{ credited: number; balance: number; streak: number }>('/api/streak', { address });
}

/**
 * Tip another player by username, out of your own earned balance.
 *
 * Signed: this one gives your NIM away, so the server must be sure it was you
 * who asked. The signature names the recipient and the amount, so it cannot be
 * replayed for a different tip.
 */
export async function tipPlayer(
  address: string,
  username: string,
  luna: number,
): Promise<{ sent: number; balance: number; username: string }> {
  const auth = await signIntent(address, `tip:${username.trim().toLowerCase()}:${luna}`);
  return post<{ sent: number; balance: number; username: string }>('/api/tip', {
    ...auth,
    username: username.trim(),
    luna,
  });
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

export type ActivityKind = 'tip-in' | 'tip-out' | 'reward' | 'check-in' | 'withdrawal' | 'payout';

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  /** Signed: positive is money in, negative is money out. Luna. */
  luna: number;
  label: string;
  at: number;
  href?: string;
}

/**
 * The server's record of what moved this player's balance.
 *
 * Unlike the device's own earnings list, this includes things that happened
 * *to* them — a tip arriving, a pot settling — which no local ledger could
 * know about. Null when the deployment records none of it.
 */
export async function fetchActivity(address: string): Promise<ActivityEntry[] | null> {
  try {
    const response = await fetch(`/api/activity?address=${encodeURIComponent(address)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { entries?: ActivityEntry[] };
    return Array.isArray(body.entries) ? body.entries : null;
  } catch {
    return null;
  }
}
