import 'server-only';

/**
 * Server-side configuration.
 *
 * None of this is `NEXT_PUBLIC_`, and it must never become so: the treasury
 * passphrase and the store token are secrets, and anything public is inlined
 * into the bundle that ships to every player's phone.
 */
function req(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Albatross RPC endpoint the server talks to. */
export const RPC_URL = req('NIMIQ_RPC_URL');
/** Optional HTTP basic auth for that endpoint, as `user:pass`. */
export const RPC_AUTH = req('NIMIQ_RPC_AUTH');

/** Treasury wallet address, held by the RPC node. Receives stakes, pays winners. */
export const TREASURY_ADDRESS = req('NIMIQ_TREASURY_ADDRESS');
/** Passphrase used to unlock that wallet on the node before sending. */
export const TREASURY_PASSPHRASE = req('NIMIQ_TREASURY_PASSPHRASE');

/** Upstash Redis REST credentials. Without these the store is not durable. */
export const KV_URL = req('KV_REST_API_URL');
export const KV_TOKEN = req('KV_REST_API_TOKEN');

/** Payouts are refused above this, so a bug cannot drain the treasury. */
export const MAX_PAYOUT_LUNA = Number(req('NIMIQ_MAX_PAYOUT_LUNA') ?? 500_000_00);

export const hasTreasury = Boolean(RPC_URL && TREASURY_ADDRESS && TREASURY_PASSPHRASE);
export const hasDurableStore = Boolean(KV_URL && KV_TOKEN);
/**
 * A node to read the chain with. Enough to look up a balance, which is why it
 * is separate from `hasTreasury` — reading needs no wallet and no passphrase.
 */
export const hasRpc = Boolean(RPC_URL);
