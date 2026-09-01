/**
 * Environment configuration.
 *
 * Everything a Mini App reads at runtime is public: the bundle ships to the
 * WebView, so `NEXT_PUBLIC_*` is the only correct prefix here. Never put a
 * secret in this file — route anything privileged through a backend later.
 *
 * `process.env.NEXT_PUBLIC_*` must be referenced statically (not via a computed
 * key) so Next.js can inline the values at build time.
 */

export type NimiqNetworkLabel = 'mainnet' | 'testnet' | 'unknown';

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

/**
 * Optional Nimiq JSON-RPC endpoint.
 *
 * The Mini App Nimiq provider does NOT expose a balance method (see
 * `lib/nimiq/provider.ts`). When this is set, TeTe reads the account balance
 * from a real Albatross RPC node through the provider's own RPC routing.
 * When it is unset, the balance is reported as unavailable — never faked.
 *
 * Public endpoints are listed at https://nimiq.dev/rpc/open-servers
 * (they are explicitly not production-grade; run your own node for production).
 */
export const NIMIQ_RPC_URL = trimmed(process.env.NEXT_PUBLIC_NIMIQ_RPC_URL);

/**
 * Informational only. Nimiq Pay decides which network the wallet is on (its
 * hidden dev menu switches mainnet/testnet); a Mini App cannot query that.
 * This label documents which network the configured RPC endpoint points at, so
 * the UI can say so instead of implying it detected the wallet's network.
 */
export const NIMIQ_NETWORK_LABEL: NimiqNetworkLabel =
  (trimmed(process.env.NEXT_PUBLIC_NIMIQ_NETWORK) as NimiqNetworkLabel | undefined) ?? 'unknown';

/**
 * Public HTTPS origin this Mini App is deployed to. Used to render the
 * Nimiq Pay deeplink on the desktop fallback screen. Optional: when unset the
 * UI falls back to the current origin at runtime.
 */
export const APP_URL = trimmed(process.env.NEXT_PUBLIC_APP_URL);

/**
 * Chain TeTe prefers for the USDT stake path, as a hex chain id.
 * Defaults to Polygon (`0x89`), the chain Nimiq's own documentation uses for
 * its USDT example. Must be one of the chains Nimiq Pay exposes.
 */
export const EVM_DEFAULT_CHAIN_ID = trimmed(process.env.NEXT_PUBLIC_EVM_DEFAULT_CHAIN_ID) ?? '0x89';

/**
 * Intro footage played after connecting. Defaults to the bundled clip; point it
 * elsewhere to swap the film without touching code, or set it to an empty
 * string to fall back to the composited animation.
 *
 * Keep any replacement small — it loads on a phone connection inside a WebView.
 * The bundled clip is ~508 KB and 2.6s.
 */
export const INTRO_VIDEO = trimmed(process.env.NEXT_PUBLIC_INTRO_VIDEO) ?? '/brand/intro.mp4';

/**
 * Optional block explorer URL template for a transaction, with `{hash}` as the
 * placeholder. Left unset by default rather than guessing a domain — TeTe still
 * shows the hash itself (with copy) either way.
 */
export const EXPLORER_TX_URL = trimmed(process.env.NEXT_PUBLIC_EXPLORER_TX_URL);

/** Milliseconds to wait for Nimiq Pay to inject `window.nimiq`. */
export const PROVIDER_INIT_TIMEOUT_MS = 10_000;
