'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { useMiniApp } from '@/state/mini-app-provider';

import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

/**
 * The persistent frame every screen renders inside: header, scrolling content,
 * bottom navigation.
 *
 * Keying the content wrapper on the pathname replays the entry animation on
 * every route change, which gives navigation a sense of movement without a
 * transition library. The content column reserves room for the sticky bar so
 * the last element of a screen is never trapped underneath it.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { host } = useMiniApp();

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <TopBar />

      {host === 'unavailable' && <OutsideHostBanner />}

      <main
        key={pathname}
        className="mx-auto w-full max-w-md flex-1 animate-[var(--animate-rise)] px-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}
      >
        {children}
      </main>

      <TabBar />
    </div>
  );
}

/**
 * Shown when no wallet provider was injected — i.e. TeTe is open in a normal
 * browser rather than inside Nimiq Pay. It is a slim banner, not a takeover:
 * every screen stays browsable, the wallet-backed numbers just report honestly
 * that there is no wallet to read.
 */
function OutsideHostBanner() {
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-1">
      <div className="flex items-center gap-2.5 rounded-2xl border-2 border-gold/40 bg-gold/10 px-3.5 py-2.5">
        <span aria-hidden className="text-[1rem] leading-none">📱</span>
        <p className="text-[0.75rem] leading-snug text-gold">
          Browsing outside Nimiq Pay — wallet features need the app.
        </p>
      </div>
    </div>
  );
}
