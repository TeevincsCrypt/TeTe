/**
 * EVM chains Nimiq Pay currently exposes to Mini Apps, and the USDT contract on
 * each. Values are taken from the official Mini Apps documentation
 * (supported networks + the EVM tokens guide); they are not guesses.
 *
 * Nimiq Pay derives one EVM wallet from the user's entropy and uses the SAME
 * address on every chain. What changes between chains is which contract you
 * call — hence a per-chain token address rather than a per-chain account.
 *
 * Chain ids are hex strings everywhere, because that is what
 * `wallet_switchEthereumChain` and `eth_chainId` speak. Only EIP-712 typed data
 * uses a numeric chain id.
 */

export interface Erc20Token {
  symbol: string;
  address: `0x${string}`;
  /** USDT and USDC use 6 decimals, not the usual 18. */
  decimals: number;
}

export interface EvmChain {
  /** Hex chain id, e.g. '0x89'. */
  id: string;
  name: string;
  nativeCurrencySymbol: string;
  /** Set when Nimiq's documentation lists a USDT contract for this chain. */
  usdt?: Erc20Token;
  /** Test networks must never be used for real stakes. */
  testnet?: boolean;
}

export const EVM_CHAINS: readonly EvmChain[] = [
  {
    id: '0x89',
    name: 'Polygon',
    nativeCurrencySymbol: 'POL',
    usdt: { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
  },
  {
    id: '0x1',
    name: 'Ethereum',
    nativeCurrencySymbol: 'ETH',
    usdt: { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  },
  {
    id: '0xa4b1',
    name: 'Arbitrum One',
    nativeCurrencySymbol: 'ETH',
    usdt: { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
  },
  {
    id: '0xa',
    name: 'Optimism',
    nativeCurrencySymbol: 'ETH',
    usdt: { symbol: 'USDT', address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
  },
  // Listed by Nimiq Pay, but its documentation gives no USDT contract for these
  // two. We surface them so chain detection is accurate, and simply report that
  // the USDT stake path is unavailable there rather than guessing an address.
  { id: '0x2105', name: 'Base', nativeCurrencySymbol: 'ETH' },
  { id: '0x38', name: 'BNB Smart Chain', nativeCurrencySymbol: 'BNB' },
  { id: '0xaa36a7', name: 'Sepolia', nativeCurrencySymbol: 'ETH', testnet: true },
];

/** Normalise a hex chain id: lower-case, no leading zeros, '0x' prefixed. */
export function normalizeChainId(chainId: string): string {
  const raw = chainId.trim().toLowerCase();
  if (!raw.startsWith('0x')) return raw;
  const digits = raw.slice(2).replace(/^0+(?=.)/, '');
  return `0x${digits}`;
}

export function findChain(chainId: string): EvmChain | undefined {
  const wanted = normalizeChainId(chainId);
  return EVM_CHAINS.find((chain) => normalizeChainId(chain.id) === wanted);
}

/** Human label for a chain id, including ones Nimiq Pay does not list. */
export function chainLabel(chainId: string): string {
  return findChain(chainId)?.name ?? `Unknown chain (${normalizeChainId(chainId)})`;
}

/** The USDT contract on a chain, or undefined when TeTe has no verified address. */
export function usdtOn(chainId: string): Erc20Token | undefined {
  return findChain(chainId)?.usdt;
}
