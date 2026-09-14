import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { ADMIN_TOKEN, hasAdmin, hasDurableStore, hasTreasury, MAX_PAYOUT_LUNA, TREASURY_ADDRESS } from '@/lib/server/env';
import { rewardsBalanceKey } from '@/lib/server/rewards';
import { accountBalance, transactionsFor, type RpcTransaction } from '@/lib/server/rpc';
import { get } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const compact = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : null;

const nim = (luna: number | null) => (luna === null ? null : luna / 100_000);

/**
 * Why a withdrawal said "sent" and never arrived.
 *
 * The withdrawal path has exactly one way to lose money silently: the node
 * accepts a transaction, hands back a hash, and then never includes it in a
 * block — at which point the app has already zeroed the player's balance
 * against a payment that will never happen. Every plausible cause of that is
 * a number on this page:
 *
 *  - `treasury.balanceNim` below what is being withdrawn is the whole answer.
 *    A send is accepted against the mempool and dropped at block inclusion,
 *    which looks exactly like success from the caller's side. The treasury is
 *    funded by challenge stakes and by the operator; arcade rewards are
 *    credited from nothing, so a treasury that has never been topped up has
 *    nothing to pay them with.
 *  - `outgoing` empty, while players report withdrawals, means sends are not
 *    reaching the chain at all rather than reaching the wrong place.
 *  - `outgoing` present but `unconfirmed` means they reach the chain and stall.
 *
 * Nothing here can move money: no key, passphrase or signature is exposed,
 * and every call is a read. It is still gated behind the admin token, for two
 * reasons. It takes an arbitrary address and reports that player's internal
 * reward balance, which is nobody else's business; and it will happily make a
 * hundred RPC calls per request, which is a free amplifier pointed at the
 * node. Chain data is public, but neither of those has to be.
 *
 * The gate is the same token as /api/admin/credit and is compared in constant
 * time, so a wrong guess reveals nothing by how long it takes to fail.
 */
function authorized(request: Request): boolean {
  if (!hasAdmin) return false;
  const given = Buffer.from((request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(ADMIN_TOKEN as string);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(request: Request) {
  // A wrong or missing token is 404, not 401: an endpoint that announces
  // itself to anyone who knocks is an invitation to keep knocking.
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const address = params.get('address')?.trim() || null;
  const hash = params.get('hash')?.trim() || null;

  if (!hasTreasury) {
    return NextResponse.json(
      {
        configured: false,
        error:
          'No treasury is configured on this deployment. Withdrawals cannot send anything: set NIMIQ_RPC_URL, NIMIQ_TREASURY_ADDRESS and NIMIQ_TREASURY_PASSPHRASE.',
        hasDurableStore,
      },
      { status: 503 },
    );
  }

  const treasury = TREASURY_ADDRESS as string;
  const errors: Record<string, string> = {};

  let balance: number | null = null;
  try {
    balance = await accountBalance(treasury);
  } catch (cause: unknown) {
    errors.balance = cause instanceof Error ? cause.message : 'RPC failed';
  }

  let treasuryTx: RpcTransaction[] = [];
  try {
    treasuryTx = await transactionsFor(treasury, 100);
  } catch (cause: unknown) {
    errors.treasuryTx = cause instanceof Error ? cause.message : 'RPC failed';
  }

  const treasuryCompact = compact(treasury);
  const outgoing = treasuryTx.filter((tx) => compact(tx.from) === treasuryCompact);
  const incoming = treasuryTx.filter((tx) => compact(tx.to) === treasuryCompact);

  const summarize = (tx: RpcTransaction) => ({
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    valueNim: typeof tx.value === 'number' ? tx.value / 100_000 : tx.value,
    confirmations: tx.confirmations,
    blockNumber: tx.blockNumber,
    timestamp: tx.timestamp,
    confirmed:
      (typeof tx.confirmations === 'number' && tx.confirmations >= 1) ||
      (typeof tx.blockNumber === 'number' && tx.blockNumber > 0),
  });

  // A player's own view: what the ledger still owes them, and whether the
  // treasury has ever actually paid their address on chain.
  let player: Record<string, unknown> | null = null;
  if (address) {
    let owed: number | null = null;
    if (hasDurableStore) {
      try {
        owed = (await get<number>(rewardsBalanceKey(address))) ?? 0;
      } catch (cause: unknown) {
        errors.playerBalance = cause instanceof Error ? cause.message : 'store read failed';
      }
    }
    let playerTx: RpcTransaction[] = [];
    try {
      playerTx = await transactionsFor(address, 100);
    } catch (cause: unknown) {
      errors.playerTx = cause instanceof Error ? cause.message : 'RPC failed';
    }
    const addressCompact = compact(address);
    const paidToThem = playerTx.filter(
      (tx) => compact(tx.to) === addressCompact && compact(tx.from) === treasuryCompact,
    );
    player = {
      address,
      // What the server still thinks it owes them. Zeroed on every withdrawal
      // attempt, so 0 here alongside nothing in `receivedFromTreasury` is the
      // exact shape of "the ledger was spent but the chain never moved."
      unwithdrawnLuna: owed,
      unwithdrawnNim: nim(owed),
      transactionCount: playerTx.length,
      receivedFromTreasuryCount: paidToThem.length,
      receivedFromTreasury: paidToThem.map(summarize),
    };
  }

  let located: Record<string, unknown> | null = null;
  if (hash) {
    const inTreasury = treasuryTx.find((tx) => tx.hash === hash);
    located = {
      hash,
      foundInTreasuryHistory: Boolean(inTreasury),
      transaction: inTreasury ? summarize(inTreasury) : null,
    };
  }

  const unconfirmed = outgoing.filter((tx) => !summarize(tx).confirmed);

  return NextResponse.json({
    configured: true,
    hasDurableStore,
    reachedNode: balance !== null || treasuryTx.length > 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    treasury: {
      address: treasury,
      balanceLuna: balance,
      // The number that decides everything. If this is smaller than what
      // players are withdrawing, no code change can make the payouts land —
      // the treasury simply has to be topped up.
      balanceNim: nim(balance),
      maxPayoutNim: MAX_PAYOUT_LUNA / 100_000,
    },
    verdict:
      balance === null
        ? 'Could not read the treasury balance — see errors.'
        : balance === 0
          ? 'The treasury is EMPTY. Every payout will be accepted by the node and then dropped, which looks exactly like "sent" to the app. Send NIM to the treasury address above to fix this.'
          : `The treasury holds ${nim(balance)} NIM. Payouts larger than this cannot land.`,
    counts: {
      treasuryTx: treasuryTx.length,
      outgoing: outgoing.length,
      incoming: incoming.length,
      outgoingUnconfirmed: unconfirmed.length,
    },
    player,
    located,
    outgoing: outgoing.map(summarize),
    incoming: incoming.map(summarize),
  });
}
