/**
 * Minimal ERC-20 reads for the USDT stake path.
 *
 * ABI encoding goes through viem, as the official Mini Apps checklist requires
 * ("ABI encoding uses a library, not manual encoding"). We import the two
 * functions we need so the rest of viem is tree-shaken out of the bundle.
 *
 * Phase 1 reads balances only. Transfers and escrow come later, and will need
 * the user to hold the chain's native token for gas: a Mini App transfer goes
 * through `eth_sendTransaction` under standard EVM gas rules, without the gas
 * abstraction Nimiq Pay applies to its own native USDT sends.
 */

import { encodeFunctionData, formatUnits } from 'viem';

import { ethCall } from './provider';
import type { Erc20Token } from './chains';

const BALANCE_OF_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export interface TokenBalance {
  /** Raw on-chain integer, in the token's smallest unit. */
  raw: bigint;
  /** Decimal string, e.g. "12.5". Formatted with the token's real decimals. */
  formatted: string;
  token: Erc20Token;
}

/** Read an ERC-20 balance. Read-only: no confirmation dialog. */
export async function readTokenBalance(
  token: Erc20Token,
  owner: string,
): Promise<TokenBalance> {
  const data = encodeFunctionData({
    abi: BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: [owner as `0x${string}`],
  });

  const result = await ethCall(token.address, data);
  // An empty result means there is no contract at that address on this chain.
  const raw = result && result !== '0x' ? BigInt(result) : 0n;

  return { raw, formatted: formatUnits(raw, token.decimals), token };
}

/** Shorten an EVM address for tight UI: 0x1234…cdef. */
export function shortenEvmAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}
