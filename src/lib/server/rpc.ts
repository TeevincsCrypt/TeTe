import 'server-only';

import { RPC_AUTH, RPC_URL } from './env';

/**
 * Minimal Albatross JSON-RPC client for the server.
 *
 * Separate from the Mini App provider's RPC routing on purpose: this one talks
 * to a node the operator runs, using credentials that never reach a browser.
 */
export class RpcError extends Error {}

export async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  if (!RPC_URL) throw new RpcError('No Nimiq RPC endpoint is configured.');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (RPC_AUTH) headers.Authorization = `Basic ${Buffer.from(RPC_AUTH).toString('base64')}`;

  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    cache: 'no-store',
  });

  if (!response.ok) throw new RpcError(`RPC ${method} failed: ${response.status}`);

  const body = (await response.json()) as {
    result?: { data?: T };
    error?: { message?: string; data?: string };
  };
  if (body.error) throw new RpcError(body.error.data || body.error.message || `RPC ${method} failed`);
  return body.result?.data as T;
}

export interface RpcTransaction {
  hash: string;
  from: string;
  to: string;
  value: number;
  data?: string;
  senderData?: string;
  recipientData?: string;
  blockNumber?: number;
  timestamp?: number;
  confirmations?: number;
}

/** Recent transactions involving an address, newest first. */
export function transactionsFor(address: string, max = 100): Promise<RpcTransaction[]> {
  return rpc<RpcTransaction[]>('getTransactionsByAddress', [address, max]);
}

export function accountBalance(address: string): Promise<number> {
  return rpc<{ balance: number }>('getAccountByAddress', [address]).then((a) => a.balance);
}
