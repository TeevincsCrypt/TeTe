'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/components/ui/cn';
import { defaultHandle } from '@/lib/profile/local-profile';
import { useMiniApp } from '@/state/mini-app-provider';
import { useLocalProfile } from '@/state/use-local-profile';

import { BrandMark } from './BrandMark';
import { NoticeBar, NoticeBell } from './NoticeBar';

/**
 * Floating pill header: a near-black bar anchoring the white page, brand on the
 * left and identity on the right. It stays put while content scrolls under it,
 * so the player's handle and connection state are always one glance away.
 */
export function TopBar() {
  const [noticesOpen, setNoticesOpen] = useState(false);
  const { nimiq } = useMiniApp();
  const { displayName, avatarSeed, photo } = useLocalProfile();
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
          'rounded-full bg-contrast py-2 pl-4 pr-2',
          
        )}
      >
        <Link href="/" aria-label="TeTe home" className="flex items-center py-1">
          <BrandMark size={34} withWordmark={false} />
        </Link>

        <div className="flex items-center gap-1">
          <NoticeBell onOpen={() => setNoticesOpen(true)} />
          {connected ? (
          <Link
            href="/profile"
            className="flex min-h-10 items-center gap-2 rounded-full border border-on-contrast/15 bg-on-contrast/10 py-1 pl-3 pr-1 transition-transform duration-150 active:scale-95"
          >
            <span className="max-w-[6.5rem] truncate text-[0.8125rem] font-bold text-on-contrast">
              {handle}
            </span>
            <Avatar address={nimiq.address} size={30} seed={avatarSeed} photo={photo} />
          </Link>
          ) : (
            <span className="flex min-h-10 items-center gap-1.5 rounded-full border border-on-contrast/25 px-3 text-[0.75rem] font-bold text-on-contrast/70">
              <span className="size-1.5 rounded-full bg-on-contrast/50" />
              Not connected
            </span>
          )}
        </div>
      </div>

      {noticesOpen && <NoticeBar onClose={() => setNoticesOpen(false)} />}
    </div>
  );
}
