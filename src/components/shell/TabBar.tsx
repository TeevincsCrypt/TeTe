'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/components/ui/cn';

import { ArcadeIcon, HomeIcon, PlusIcon, SwordsIcon, UserIcon } from './icons';

/**
 * Bottom navigation. Every tab is a real route — nothing here is disabled.
 *
 * Create sits in the middle as a raised accent disc rather than another icon in
 * the row, because creating a challenge is the one action the whole product is
 * built around and it should be reachable by thumb without aiming.
 */
const TABS = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/challenges', label: 'Battles', Icon: SwordsIcon },
  { href: '/create', label: 'Create', Icon: PlusIcon, primary: true },
  { href: '/arcade', label: 'Arcade', Icon: ArcadeIcon },
  { href: '/profile', label: 'You', Icon: UserIcon },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-20 border-t border-ink/12 bg-bg/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex w-full max-w-md items-end">
        {TABS.map(({ href, label, Icon, ...rest }) => {
          const primary = 'primary' in rest && rest.primary;
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

          if (primary) {
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-label="Create challenge"
                  aria-current={active ? 'page' : undefined}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 pb-1"
                >
                  <span
                    className={cn(
                      'flex size-12 items-center justify-center rounded-full bg-ink text-accent',
                      'transition-transform duration-150 active:scale-90',
                      active && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
                    )}
                  >
                    <Icon className="size-6" strokeWidth={2.5} />
                  </span>
                  <span className="text-[0.5625rem] font-black uppercase tracking-wider text-accent-text">
                    {label}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 pb-1',
                  'transition-colors duration-150',
                  active ? 'text-accent-text' : 'text-faint active:text-muted',
                )}
              >
                <Icon className="size-[1.375rem]" />
                <span className="text-[0.5625rem] font-black uppercase tracking-wider">{label}</span>
                <span
                  className={cn(
                    'h-1 w-1 rounded-full transition-colors duration-150',
                    active ? 'bg-accent-text' : 'bg-transparent',
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
