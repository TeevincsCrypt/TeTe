'use client';

import { RefreshIcon } from '@/components/shell/icons';
import { Card, CardLabel } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { shortenAddress } from '@/lib/nimiq/address';
import { formatNim } from '@/lib/nimiq/units';
import { useMiniApp } from '@/state/mini-app-provider';

/**
 * The connected Nimiq account.
 *
 * The balance deserves a note: the Mini App Nimiq provider has no balance
 * method. Its documented surface is listAccounts / sign / isConsensusEstablished
 * / getBlockNumber / send*Transaction — nothing that reads an account. When this
 * deployment configures a Nimiq JSON-RPC endpoint, TeTe reads the real balance
 * through the provider's RPC routing. When it does not, the card says the
 * balance is unavailable. It never shows a stand-in number.
 */
export function NimAccountCard() {
  const { nimiq, locale, hasNimiqRpc, refreshNimiqBalance } = useMiniApp();

  if (!nimiq.address) return null;

  return (
    <Card accent="accent">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardLabel>Nimiq account</CardLabel>
          <p className="mt-1.5 font-mono text-[0.8125rem] tracking-tight text-muted">
            {shortenAddress(nimiq.address)}
          </p>
        </div>
        {hasNimiqRpc && (
          <button
            type="button"
            onClick={refreshNimiqBalance}
            aria-label="Refresh balance"
            disabled={nimiq.balanceStatus === 'loading'}
            className="-m-2 flex size-11 items-center justify-center rounded-full text-faint transition-colors hover:text-text disabled:opacity-40"
          >
            <RefreshIcon
              className={`size-4 ${nimiq.balanceStatus === 'loading' ? 'animate-spin' : ''}`}
            />
          </button>
        )}
      </div>

      <div className="mt-5">
        {nimiq.balanceStatus === 'loading' && <Skeleton className="h-10 w-40" />}

        {nimiq.balanceStatus === 'ready' && nimiq.balanceLuna !== null && (
          <p className="text-[2.25rem] font-black leading-none tracking-[-0.04em] tabular">
            {formatNim(nimiq.balanceLuna, { locale })}
            <span className="ml-2 text-[1rem] font-bold text-faint">NIM</span>
          </p>
        )}

        {nimiq.balanceStatus === 'unsupported' && (
          <div>
            <p className="text-[1.25rem] font-bold leading-tight tracking-tight text-faint">
              Balance unavailable
            </p>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
              The Nimiq Pay Mini App provider does not expose a balance method. Set{' '}
              <code className="font-mono text-[0.75rem] text-faint">NEXT_PUBLIC_NIMIQ_RPC_URL</code>{' '}
              to read it from a Nimiq node.
            </p>
          </div>
        )}

        {nimiq.balanceStatus === 'error' && (
          <div>
            <p className="text-[1.25rem] font-bold leading-tight tracking-tight text-negative">
              Balance unavailable
            </p>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">{nimiq.balanceError}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
