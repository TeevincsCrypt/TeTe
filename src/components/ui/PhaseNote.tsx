import type { ReactNode } from 'react';

import { WrenchIcon } from '@/components/shell/icons';

import { cn } from './cn';

/**
 * The honesty marker.
 *
 * TeTe's escrow, matchmaking and settlement are not built yet. Anywhere the UI
 * shows a surface that will later hold real challenge data, this states plainly
 * that it is not live — so nothing on screen can be mistaken for a working
 * on-chain feature.
 */
export function PhaseNote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl bg-panel-2 px-3.5 py-3',
        className,
      )}
    >
      <WrenchIcon className="mt-px size-3.5 shrink-0 text-faint" />
      <p className="text-[0.75rem] leading-snug text-faint">{children}</p>
    </div>
  );
}
