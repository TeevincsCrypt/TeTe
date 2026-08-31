/**
 * Access to the Nimiq provider that Nimiq Pay injects into the Mini App WebView.
 *
 * Rules this module enforces, straight from the official Mini Apps docs:
 *
 * 1. The provider is reached ONLY through `init()` from `@nimiq/mini-app-sdk`.
 *    We never construct a `NimiqProvider` ourselves and never poke at
 *    `window.nimiq` directly for wallet calls.
 * 2. Wallet operations are mediated by Nimiq Pay and gated behind native
 *    confirmation dialogs. TeTe never sees a private key or a seed phrase.
 * 3. Provider calls report failure in two different shapes — a thrown error, or
 *    a resolved `{ error: { type, message } }` object. Both are normalised into
 *    `NimiqProviderError` here so callers have exactly one thing to handle.
 *
 * Method surface actually available (Nimiq Provider API reference):
 *   listAccounts, sign, isConsensusEstablished, getBlockNumber,
 *   sendBasicTransaction, sendBasicTransactionWithData, and the staking family.
 * There is deliberately no balance method — see `readAccount()` below.
 */

import { init } from '@nimiq/mini-app-sdk';

import { PROVIDER_INIT_TIMEOUT_MS } from '@/lib/config/env';

import { NimiqProviderError } from './types';
import type { NimiqAccount, NimiqChainStatus, NimiqProvider } from './types';

/**
 * Synchronous check for the host context Nimiq Pay seeds before page scripts
 * run. Safe to call during render; returns false during SSR.
 *
 * `window.nimiqPay` is the reliable *synchronous* signal. `window.nimiq` (the
 * wallet provider) can be injected a moment later, which is why connecting
 * goes through `getProvider()` and its polling `init()` rather than this.
 */
export function isInsideNimiqPay(): boolean {
  if (typeof window === 'undefined') return false;
  return window.nimiqPay !== undefined || window.nimiq !== undefined;
}

let providerPromise: Promise<NimiqProvider> | null = null;

/**
 * Resolve the injected Nimiq provider, waiting for injection if needed.
 * Memoised: repeated calls share one in-flight `init()`.
 *
 * This does NOT prompt the user. It only waits for `window.nimiq` to appear,
 * so it is safe to run on mount.
 */
export function getProvider(): Promise<NimiqProvider> {
  if (typeof window === 'undefined') {
    return Promise.reject(
      new NimiqProviderError('unavailable', 'The Nimiq provider is only available in the browser.'),
    );
  }

  if (!providerPromise) {
    providerPromise = init({ timeout: PROVIDER_INIT_TIMEOUT_MS }).catch((cause: unknown) => {
      // Allow a later retry (e.g. the user reopened the app inside Nimiq Pay).
      providerPromise = null;
      throw new NimiqProviderError(
        'unavailable',
        'Nimiq Pay did not inject its wallet provider. Open TeTe from inside the Nimiq Pay app.',
        cause instanceof Error ? cause.name : undefined,
      );
    });
  }

  return providerPromise;
}

/** Shape of the error object the provider may resolve with instead of throwing. */
function readErrorEnvelope(value: unknown): { type?: string; message?: string } | null {
  if (typeof value !== 'object' || value === null || !('error' in value)) return null;
  const { error } = value as { error?: unknown };
  if (typeof error !== 'object' || error === null) return { message: 'Provider request failed.' };
  const { type, message } = error as { type?: unknown; message?: unknown };
  return {
    type: typeof type === 'string' ? type : undefined,
    message: typeof message === 'string' ? message : 'Provider request failed.',
  };
}

const REJECTION_HINTS = ['permissiondenied', 'user rejected', 'denied', 'cancelled', 'canceled'];

function classify(type: string | undefined, message: string): NimiqProviderError['kind'] {
  const haystack = `${type ?? ''} ${message}`.toLowerCase();
  return REJECTION_HINTS.some((hint) => haystack.includes(hint)) ? 'rejected' : 'failed';
}

/**
 * Run a provider call and collapse both failure shapes into `NimiqProviderError`.
 * `T` must not itself be an object carrying an `error` key.
 */
export async function unwrap<T>(call: () => Promise<T | { error: unknown }>): Promise<T> {
  let result: T | { error: unknown };

  try {
    result = await call();
  } catch (cause: unknown) {
    if (cause instanceof NimiqProviderError) throw cause;
    const envelope = readErrorEnvelope(cause);
    const message =
      envelope?.message ?? (cause instanceof Error ? cause.message : 'Provider request failed.');
    const type = envelope?.type ?? (cause instanceof Error ? cause.name : undefined);
    throw new NimiqProviderError(classify(type, message), message, type);
  }

  const envelope = readErrorEnvelope(result);
  if (envelope) {
    const message = envelope.message ?? 'Provider request failed.';
    throw new NimiqProviderError(classify(envelope.type, message), message, envelope.type);
  }

  return result as T;
}

/**
 * Ask Nimiq Pay for the user's Nimiq addresses.
 *
 * Shows a native confirmation dialog, so it MUST be triggered by a deliberate
 * user action — never on page load. Returns user-friendly `NQ…` addresses.
 */
export async function requestAccounts(): Promise<string[]> {
  const provider = await getProvider();
  const accounts = await unwrap<unknown>(() => provider.listAccounts());
  // The host app is external code: guard the shape rather than indexing blindly.
  if (!Array.isArray(accounts)) {
    throw new NimiqProviderError('failed', 'Nimiq Pay returned an unexpected account list.');
  }
  return accounts.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Sign a plain-text message with the user's Nimiq key.
 *
 * Shows a native confirmation dialog. Phase 2 uses this to have both players
 * sign the agreed challenge terms and the reported result, giving us a
 * verifiable record that neither side can later deny.
 */
export async function signMessage(message: string): Promise<{ publicKey: string; signature: string }> {
  const provider = await getProvider();
  return unwrap<{ publicKey: string; signature: string }>(() => provider.sign(message));
}

/**
 * Send NIM from the player's wallet.
 *
 * This is a real transaction. Nimiq Pay raises its own confirmation dialog and
 * signs it — TeTe never sees a key and cannot send without the player agreeing
 * on that native prompt.
 *
 * `value` is in Luna (1 NIM = 100,000 Luna). Fee is left unset so Nimiq Pay
 * picks one, using zero where it can.
 *
 * Note the return value is documented inconsistently upstream: the API
 * reference calls it a transaction hash, while the SDK's own type comment says
 * "the serialized transaction". Callers here treat it as an opaque receipt
 * string and do not parse it.
 */
export async function sendNim(recipient: string, value: number, data?: string): Promise<string> {
  const provider = await getProvider();
  if (!Number.isInteger(value) || value <= 0) {
    throw new NimiqProviderError('failed', 'The amount must be a positive whole number of Luna.');
  }
  return unwrap<string>(() =>
    data
      ? provider.sendBasicTransactionWithData({ recipient, value, data })
      : provider.sendBasicTransaction({ recipient, value }),
  );
}

/**
 * Read consensus state and block height. Neither prompts the user, so they are
 * requested in parallel — the docs ask that read-only calls be batched.
 */
export async function readChainStatus(): Promise<NimiqChainStatus> {
  const provider = await getProvider();
  const [consensusEstablished, blockNumber] = await Promise.all([
    unwrap<boolean>(() => provider.isConsensusEstablished()),
    unwrap<number>(() => provider.getBlockNumber()),
  ]);
  return { consensusEstablished, blockNumber };
}

/**
 * Read a Nimiq account (address, balance in Luna, account type).
 *
 * The Mini App provider has no balance method. What it does have is RPC
 * routing: any method outside its wallet set is forwarded to a Nimiq JSON-RPC
 * endpoint the Mini App configures, which is the mechanism the docs describe as
 * "other RPC calls use the configured endpoint or your mini app's own RPC".
 *
 * So this is real on-chain data from a real node — but only when the deployment
 * supplies `NEXT_PUBLIC_NIMIQ_RPC_URL`. Without it, callers get `null` and the
 * UI says the balance is unavailable. TeTe never invents a number.
 *
 * Note the endpoint must serve the same network the wallet is on; Nimiq Pay's
 * testnet switch does not change where this RPC URL points.
 */
export async function readAccount(address: string, rpcUrl: string): Promise<NimiqAccount> {
  const provider = await getProvider();
  provider.setRPCUrl(rpcUrl);

  const account = await unwrap<NimiqAccount>(() =>
    provider.request<NimiqAccount>({ method: 'getAccountByAddress', params: [address] }),
  );

  if (typeof account?.balance !== 'number') {
    throw new NimiqProviderError(
      'failed',
      'The RPC endpoint did not return a Nimiq account for this address.',
    );
  }

  return account;
}
