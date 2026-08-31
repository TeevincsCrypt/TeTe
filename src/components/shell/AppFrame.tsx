'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

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

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <TopBar />

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
