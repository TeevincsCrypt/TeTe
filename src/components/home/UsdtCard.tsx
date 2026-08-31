'use client';

import { Button } from '@/components/ui/Button';
import { Card, CardLabel } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusPill } from '@/components/ui/StatusPill';
import { chainLabel, findChain } from '@/lib/evm/chains';
import { shortenEvmAddress } from '@/lib/evm/erc20';
import { useMiniApp } from '@/state/mini-app-provider';

/**
 * The USDT side of the stake, proved end to end on the EVM provider.
 *
 * Nimiq Pay injects a standard EIP-1193 provider at `window.ethereum` — no SDK
 * — and derives one EVM address that is the same on every supported chain. So
 * the interesting variable is the chain: USDT is a different contract on each,
 * and TeTe only calls contract addresses that Nimiq's own documentation lists.
 *
 * The balance shown here is a real `eth_call` to `balanceOf` on the live
 * contract. Connecting prompts the user; reading the balance does not.
 */
export function UsdtCard() {
  const { evm, preferredChainId, connectEvm, switchToPreferredChain } = useMiniApp();

  if (!evm.available) {
    return (
      <Card accent="violet">
        <CardLabel>USDT stakes</CardLabel>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-muted">
          No EVM provider was injected, so the USDT path is unavailable in this session.
        </p>
      </Card>
    );
  }

  const chain = evm.chainId ? findChain(evm.chainId) : undefined;
  const onPreferredChain = evm.chainId === preferredChainId;
  const preferredName = findChain(preferredChainId)?.name ?? preferredChainId;

  return (
    <Card accent="violet">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardLabel>USDT stakes</CardLabel>
          {evm.address ? (
            <p className="mt-1.5 font-mono text-[0.8125rem] tracking-tight text-muted">
              {shortenEvmAddress(evm.address)}
            </p>
          ) : (
            <p className="mt-1.5 text-[0.8125rem] text-muted">EVM wallet not connected</p>
          )}
        </div>
        {evm.chainId && (
          <StatusPill tone={chain?.testnet ? 'caution' : 'neutral'}>
            {chainLabel(evm.chainId)}
          </StatusPill>
        )}
      </div>

      {!evm.address ? (
        <div className="mt-5">
          <Button variant="secondary" onClick={connectEvm} loading={evm.status === 'loading'}>
            Connect EVM wallet
          </Button>
          {evm.status === 'error' && (
            <p
              role="alert"
              className={`mt-3 text-[0.8125rem] leading-relaxed ${
                evm.rejected ? 'text-muted' : 'text-negative'
              }`}
            >
              {evm.rejected ? 'Connection cancelled.' : evm.error}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-5">
          {evm.usdtStatus === 'loading' && <Skeleton className="h-9 w-36" />}

          {evm.usdtStatus === 'ready' && evm.usdt && (
            <p className="text-[2rem] font-black leading-none tracking-[-0.04em] tabular">
              {evm.usdt.formatted}
              <span className="ml-2 text-[0.9375rem] font-bold text-faint">USDT</span>
            </p>
          )}

          {evm.usdtStatus === 'unsupported' && (
            <p className="text-[0.875rem] leading-relaxed text-muted">
              TeTe has no verified USDT contract for {evm.chainId ? chainLabel(evm.chainId) : 'this chain'}.
              Switch to {preferredName} to stake in USDT.
            </p>
          )}

          {evm.usdtStatus === 'error' && (
            <p role="alert" className="text-[0.875rem] leading-relaxed text-negative">
              {evm.usdtError}
            </p>
          )}

          {!onPreferredChain && (
            <div className="mt-4">
              <Button variant="secondary" onClick={switchToPreferredChain}>
                Switch to {preferredName}
              </Button>
              {evm.error && (
                <p role="alert" className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
                  {evm.error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
