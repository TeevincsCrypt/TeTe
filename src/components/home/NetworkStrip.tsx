'use client';

import { StatusPill } from '@/components/ui/StatusPill';
import { NIMIQ_NETWORK_LABEL } from '@/lib/config/env';
import { useMiniApp } from '@/state/mini-app-provider';

/**
 * Live Nimiq node state, read through `isConsensusEstablished()` and
 * `getBlockNumber()`. Neither prompts the user, so both run on mount.
 *
 * The network label is deliberately absent unless the deployment declares one:
 * a Mini App cannot ask Nimiq Pay whether it is on mainnet or testnet, so
 * claiming to know would be a guess dressed up as a fact.
 */
export function NetworkStrip() {
  const { nimiq, locale } = useMiniApp();
  const { chain } = nimiq;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chain ? (
        <>
          <StatusPill tone={chain.consensusEstablished ? 'positive' : 'caution'} pulse>
            {chain.consensusEstablished ? 'Consensus' : 'Syncing'}
          </StatusPill>
          <StatusPill>
            <span className="tabular">
              #{new Intl.NumberFormat(locale).format(chain.blockNumber)}
            </span>
          </StatusPill>
        </>
      ) : (
        <StatusPill>Reading node state…</StatusPill>
      )}
      {NIMIQ_NETWORK_LABEL !== 'unknown' && (
        <StatusPill tone={NIMIQ_NETWORK_LABEL === 'testnet' ? 'caution' : 'neutral'}>
          RPC: {NIMIQ_NETWORK_LABEL}
        </StatusPill>
      )}
    </div>
  );
}
