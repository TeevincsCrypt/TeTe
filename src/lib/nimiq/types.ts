import type { NimiqProvider } from '@nimiq/mini-app-sdk';

export type { NimiqProvider };

/**
 * Result of `getAccountByAddress` on a Nimiq Albatross RPC node.
 * `balance` is an integer amount of Luna.
 */
export interface NimiqAccount {
  address: string;
  balance: number;
  type: 'basic' | 'vesting' | 'htlc' | 'staking';
}

/** Node-level state TeTe surfaces so the user can see the wallet is live. */
export interface NimiqChainStatus {
  consensusEstablished: boolean;
  blockNumber: number;
}

/** Why a Nimiq provider call did not produce a result. */
export type NimiqFailureKind =
  /** The user dismissed the native Nimiq Pay confirmation dialog. */
  | 'rejected'
  /** `window.nimiq` was never injected — we are not inside Nimiq Pay. */
  | 'unavailable'
  /** Anything else: malformed request, transport failure, host-side error. */
  | 'failed';

export class NimiqProviderError extends Error {
  readonly kind: NimiqFailureKind;
  /** Error `type` string as reported by the host app, when it gave one. */
  readonly providerType?: string;

  constructor(kind: NimiqFailureKind, message: string, providerType?: string) {
    super(message);
    this.name = 'NimiqProviderError';
    this.kind = kind;
    this.providerType = providerType;
  }
}
