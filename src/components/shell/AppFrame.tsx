'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { defaultHandle } from '@/lib/profile/local-profile';
import { useChallengeAlerts } from '@/state/use-challenge-alerts';
import { useMiniApp } from '@/state/mini-app-provider';
import { useLocalProfile } from '@/state/use-local-profile';

import { IntroSequence } from './IntroSequence';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

/**
 * The persistent frame every screen renders inside: header, scrolling content,
 * bottom navigation.
 *
 * Keying the content wrapper on the pathname replays the entry animation on
 * every route change, which gives navigation a sense of movement without a
 * transition library.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { nimiq } = useMiniApp();
  const { displayName } = useLocalProfile();
  useChallengeAlerts(nimiq.address);

  // The intro plays on the transition into a connected session, once. Tracking
  // the previous address means a route change or a re-render never replays it.
  const [intro, setIntro] = useState(false);
  const seen = useRef(false);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (nimiq.address && !previous.current && !seen.current) {
      seen.current = true;
      setIntro(true);
    }
    previous.current = nimiq.address;
  }, [nimiq.address]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {intro && (
        <IntroSequence
          handle={displayName ?? defaultHandle(nimiq.address)}
          onDone={() => setIntro(false)}
        />
      )}

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
