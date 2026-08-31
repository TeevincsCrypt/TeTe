'use client';

import { cn } from '@/components/ui/cn';

import { HomeIcon, PlusIcon, SwordsIcon, TrophyIcon, UserIcon } from './icons';

/**
 * The product's eventual navigation, shown from the start so the shell has its
 * final shape. Only Home exists in Phase 1; the rest are visibly locked rather
 * than routing to empty screens.
 */
const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon, ready: true },
  { id: 'challenges', label: 'Challenges', Icon: SwordsIcon, ready: false },
  { id: 'create', label: 'Create', Icon: PlusIcon, ready: false },
  { id: 'leaderboard', label: 'Ranks', Icon: TrophyIcon, ready: false },
  { id: 'profile', label: 'Profile', Icon: UserIcon, ready: false },
] as const;

export function TabBar() {
  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-10 border-t border-line-soft bg-ink/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex w-full max-w-md items-stretch">
        {TABS.map(({ id, label, Icon, ready }) => (
          <li key={id} className="flex-1">
            <button
              type="button"
              disabled={!ready}
              aria-current={ready ? 'page' : undefined}
              className={cn(
                'flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2',
                'transition-colors duration-150',
                ready ? 'text-accent' : 'text-faint disabled:cursor-not-allowed',
              )}
            >
              <Icon className="size-5" />
              <span className="text-[0.625rem] font-medium tracking-tight">{label}</span>
              {!ready && <span className="sr-only">Coming in a later release</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
