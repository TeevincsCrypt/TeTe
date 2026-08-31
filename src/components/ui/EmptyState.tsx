import type { ReactNode } from 'react';

import { cn } from './cn';

/**
 * The designed empty state.
 *
 * Most of TeTe's screens are legitimately empty right now — there is no
 * challenge system yet — and an empty screen is exactly where an app feels
 * unfinished. So emptiness gets the same care as content: a big glyph, a clear
 * line about what will fill it, and a way forward.
 */
export function EmptyState({
  glyph,
  title,
  body,
  action,
  className,
}: {
  glyph: string;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <span
        aria-hidden
        className="flex size-20 items-center justify-center rounded-full border-2 border-line bg-panel text-[2rem] animate-[var(--animate-bob)]"
      >
        {glyph}
      </span>
      <h3 className="display mt-5 text-[1.375rem]">{title}</h3>
      <p className="mt-2 max-w-[19rem] text-[0.875rem] leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-6 w-full max-w-[16rem]">{action}</div>}
    </div>
  );
}
