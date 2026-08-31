'use client';

import Link from 'next/link';

import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/components/ui/cn';
import { defaultHandle } from '@/lib/profile/local-profile';
import { useMiniApp } from '@/state/mini-app-provider';
import { useLocalProfile } from '@/state/use-local-profile';

import { BrandMark } from './BrandMark';

/**
 * Floating pill header: a cream bar sitting on the dark ground, brand on the
 * left and identity on the right. It stays put while content scrolls under it,
 * so the player's handle and connection state are always one glance away.
 */
export function TopBar() {
  const { nimiq } = useMiniApp();
  const { displayName } = useLocalProfile();
  const connected = nimiq.address !== null;
  const handle = displayName ?? defaultHandle(nimiq.address);

  return (
    <div
      className="sticky top-0 z-20 px-4 pb-2"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-md items-center justify-between gap-2',
          'rounded-full border-2 border-ink bg-cream py-2 pl-4 pr-2',
          'shadow-[var(--shadow-sticker-sm)]',
        )}
      >
        <Link href="/" aria-label="TeTe home" className="flex items-center py-1">
          <BrandMark />
        </Link>

        {connected ? (
          <Link
            href="/profile"
            className="flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-cream-2 py-1 pl-3 pr-1 transition-transform duration-150 active:scale-95"
          >
            <span className="max-w-[6.5rem] truncate text-[0.8125rem] font-bold text-ink">
              {handle}
            </span>
            <Avatar address={nimiq.address} size={30} />
          </Link>
        ) : (
          <span className="flex min-h-10 items-center gap-1.5 rounded-full border-2 border-ink/25 px-3 text-[0.75rem] font-bold text-ink/60">
            <span className="size-1.5 rounded-full bg-ink/40" />
            Not connected
          </span>
        )}
      </div>
    </div>
  );
}
