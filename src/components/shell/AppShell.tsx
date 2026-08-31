import type { ReactNode } from 'react';

import { cn } from '@/components/ui/cn';

/**
 * Mobile-first frame: a single centred column capped at `max-w-md`, safe-area
 * padding for the notch, and no horizontal overflow anywhere.
 *
 * When a footer is present it is sticky, so the content column reserves room
 * for it — otherwise the last card scrolls under the tab bar and its final
 * lines are unreachable.
 */
export function AppShell({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <main
        className={cn('mx-auto w-full max-w-md flex-1 px-5', className)}
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)',
          paddingBottom: footer ? 'calc(env(safe-area-inset-bottom) + 6rem)' : '2rem',
        }}
      >
        {children}
      </main>
      {footer}
    </div>
  );
}
