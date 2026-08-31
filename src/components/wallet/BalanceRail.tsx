'use client';

import { RefreshIcon } from '@/components/shell/icons';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { Skeleton } from '@/components/ui/Skeleton';
import { chainLabel, findChain } from '@/lib/evm/chains';
import { formatNim } from '@/lib/nimiq/units';
import { useMiniApp } from '@/state/mini-app-provider';

/**
 * The two stake currencies, side by side.
 *
 * Both numbers are read live — NIM from a Nimiq node, USDT from a `balanceOf`
 * call on the real contract. Where a balance genuinely cannot be read, the card
 * says so in words. Nothing here ever renders a stand-in figure.
 */
export function BalanceRail() {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
      <NimBalance />
      <UsdtBalance />
    </div>
  );
}

const CARD = 'relative w-[63%] shrink-0 snap-start overflow-hidden rounded-[var(--radius-sticker)] border-2 border-ink p-4 shadow-[var(--shadow-sticker)]';

function NimBalance() {
  const { nimiq, locale, hasNimiqRpc, refreshNimiqBalance } = useMiniApp();

  return (
    <article className={cn(CARD, 'bg-accent text-ink')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow text-ink/65">Nimiq</p>
          <p className="display mt-0.5 text-[1rem]">NIM</p>
        </div>
        {hasNimiqRpc && nimiq.address && (
          <button
            type="button"
            onClick={refreshNimiqBalance}
            aria-label="Refresh NIM balance"
            disabled={nimiq.balanceStatus === 'loading'}
            className="-m-2 flex size-11 items-center justify-center rounded-full text-ink/50 transition-colors active:text-ink disabled:opacity-40"
          >
            <RefreshIcon className={cn('size-4', nimiq.balanceStatus === 'loading' && 'animate-spin')} />
          </button>
        )}
      </div>

      <div className="mt-6">
        {!nimiq.address && <p className="text-[0.875rem] font-bold text-ink/60">Connect to view</p>}

        {nimiq.address && nimiq.balanceStatus === 'loading' && (
          <Skeleton className="h-8 w-28 bg-ink/15" />
        )}

        {nimiq.address && nimiq.balanceStatus === 'ready' && nimiq.balanceLuna !== null && (
          <p className="display text-[1.75rem] tabular">{formatNim(nimiq.balanceLuna, { locale })}</p>
        )}

        {nimiq.address && nimiq.balanceStatus === 'unsupported' && (
          <p className="text-[0.8125rem] font-semibold leading-snug text-ink/65">
            No balance API — add an RPC endpoint to read it.
          </p>
        )}

        {nimiq.address && nimiq.balanceStatus === 'error' && (
          <p className="text-[0.8125rem] font-semibold leading-snug text-ink/65">
            Couldn’t reach the node.
          </p>
        )}
      </div>
    </article>
  );
}

function UsdtBalance() {
  const { evm, preferredChainId, connectEvm, switchToPreferredChain } = useMiniApp();
  const preferredName = findChain(preferredChainId)?.name ?? preferredChainId;
  const onPreferred = evm.chainId === preferredChainId;

  return (
    <article className={cn(CARD, 'bg-violet text-white')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow text-white/60">Stablecoin</p>
          <p className="display mt-0.5 text-[1rem]">USDT</p>
        </div>
        {evm.chainId && (
          <Chip tone="inverse" className="border-white/30 text-white/85">
            {chainLabel(evm.chainId)}
          </Chip>
        )}
      </div>

      <div className="mt-6">
        {!evm.available && <p className="text-[0.8125rem] font-semibold text-white/70">No EVM wallet here</p>}

        {evm.available && !evm.address && (
          <button
            type="button"
            onClick={connectEvm}
            className="min-h-10 rounded-full border-2 border-white/40 px-4 text-[0.8125rem] font-bold transition-transform active:scale-95"
          >
            {evm.status === 'loading' ? 'Waiting…' : 'Connect'}
          </button>
        )}

        {evm.address && evm.usdtStatus === 'loading' && <Skeleton className="h-8 w-24 bg-white/20" />}

        {evm.address && evm.usdtStatus === 'ready' && evm.usdt && (
          <p className="display text-[1.75rem] tabular">{evm.usdt.formatted}</p>
        )}

        {evm.address && evm.usdtStatus === 'unsupported' && (
          <button
            type="button"
            onClick={switchToPreferredChain}
            className="min-h-10 rounded-full border-2 border-white/40 px-4 text-left text-[0.75rem] font-bold leading-tight transition-transform active:scale-95"
          >
            Switch to {preferredName}
          </button>
        )}

        {evm.address && evm.usdtStatus === 'error' && (
          <p className="text-[0.8125rem] font-semibold text-white/70">Couldn’t read balance.</p>
        )}
      </div>

      {evm.address && !onPreferred && evm.usdtStatus === 'ready' && (
        <button
          type="button"
          onClick={switchToPreferredChain}
          className="mt-2 text-[0.6875rem] font-bold text-white/70 underline underline-offset-2"
        >
          Switch to {preferredName}
        </button>
      )}
    </article>
  );
}
