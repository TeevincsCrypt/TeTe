/**
 * The EVM side of Nimiq Pay: a standard EIP-1193 provider on `window.ethereum`.
 *
 * No SDK is involved here — the official docs are explicit that `window.ethereum`
 * is used directly. Nimiq Pay is also EIP-6963 discoverable, so wallet-discovery
 * libraries find it automatically; TeTe does not need to announce anything.
 *
 * As on the Nimiq side, every write and every account request is gated behind a
 * native Nimiq Pay confirmation dialog. Read-only calls are not.
 */

export type EvmFailureKind = 'rejected' | 'unavailable' | 'chain-missing' | 'failed';

export class EvmProviderError extends Error {
  readonly kind: EvmFailureKind;
  readonly code?: number;

  constructor(kind: EvmFailureKind, message: string, code?: number) {
    super(message);
    this.name = 'EvmProviderError';
    this.kind = kind;
    this.code = code;
  }
}

export interface Eip1193Provider {
  request<T = unknown>(args: { method: string; params?: unknown[] | object }): Promise<T>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/** Synchronous detection. Returns false during SSR. */
export function isEvmAvailable(): boolean {
  return typeof window !== 'undefined' && window.ethereum !== undefined;
}

function requireProvider(): Eip1193Provider {
  const provider = typeof window === 'undefined' ? undefined : window.ethereum;
  if (!provider) {
    throw new EvmProviderError(
      'unavailable',
      'No EVM provider found. Open TeTe from inside the Nimiq Pay app.',
    );
  }
  return provider;
}

/** EIP-1193 error codes we act on. 4001 = user rejected, 4902 = unknown chain. */
function toEvmError(cause: unknown): EvmProviderError {
  if (cause instanceof EvmProviderError) return cause;

  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? Number((cause as { code: unknown }).code)
      : undefined;
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'object' && cause !== null && 'message' in cause
        ? String((cause as { message: unknown }).message)
        : 'The EVM request failed.';

  if (code === 4001) return new EvmProviderError('rejected', message, code);
  if (code === 4902) return new EvmProviderError('chain-missing', message, code);
  return new EvmProviderError('failed', message, code);
}

/** Send an EIP-1193 request, normalising failures into `EvmProviderError`. */
export async function evmRequest<T>(method: string, params?: unknown[] | object): Promise<T> {
  const provider = requireProvider();
  try {
    return await provider.request<T>(params === undefined ? { method } : { method, params });
  } catch (cause: unknown) {
    throw toEvmError(cause);
  }
}

/**
 * Prompt for the user's EVM accounts. Shows a native dialog, so it must be
 * behind a deliberate user action. The returned address is the same on every
 * supported chain.
 */
export function requestEvmAccounts(): Promise<string[]> {
  return evmRequest<string[]>('eth_requestAccounts');
}

/** Already-authorised accounts. Does not prompt; returns [] when not connected. */
export async function readEvmAccounts(): Promise<string[]> {
  try {
    return await evmRequest<string[]>('eth_accounts');
  } catch {
    return [];
  }
}

/** Current chain as a hex string. Read-only, no prompt. */
export function readChainId(): Promise<string> {
  return evmRequest<string>('eth_chainId');
}

/**
 * Switch the active chain. Prompts the user.
 * Throws with kind `chain-missing` (code 4902) when Nimiq Pay has no such chain
 * configured; the caller decides whether to offer `wallet_addEthereumChain`.
 */
export async function switchChain(chainId: string): Promise<void> {
  await evmRequest<null>('wallet_switchEthereumChain', [{ chainId }]);
}

/** Read-only contract call. No prompt. */
export function ethCall(to: string, data: string): Promise<string> {
  return evmRequest<string>('eth_call', [{ to, data }, 'latest']);
}
