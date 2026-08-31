'use client';

import { BrandMark } from '@/components/shell/BrandMark';
import { useMiniApp } from '@/state/mini-app-provider';

import { NetworkStrip } from './NetworkStrip';
import { NimAccountCard } from './NimAccountCard';
import { RoadmapCard } from './RoadmapCard';
import { UsdtCard } from './UsdtCard';

export function HomeScreen() {
  const { nimiq } = useMiniApp();

  return (
    <div className="animate-[var(--animate-rise)] space-y-5 pt-2">
      <header className="flex items-center justify-between gap-3 py-2">
        <BrandMark />
        <NetworkStrip />
      </header>

      <div>
        <h1 className="text-[1.75rem] font-black leading-tight tracking-[-0.035em]">
          Ready when you are
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          {nimiq.address
            ? 'Your wallet is connected. Challenges arrive in the next release.'
            : 'Connect your wallet to get started.'}
        </p>
      </div>

      <NimAccountCard />
      <UsdtCard />
      <RoadmapCard />
    </div>
  );
}
