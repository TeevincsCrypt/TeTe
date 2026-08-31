import type { ReactNode } from 'react';

import { cn } from './cn';

/**
 * The designed empty state.
 *
 * Most of TeTe is legitimately empty right now — there is no challenge system
 * yet — and an empty screen is exactly where an app feels unfinished. So
 * emptiness gets the same care as content: a drawn mark, a clear line about
 * what will fill it, and a way forward.
 */
export function EmptyState({
  glyph,
  title,
  body,
  action,
  className,
}: {
  glyph: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <span
        aria-hidden
        className="flex size-14 items-center justify-center rounded-2xl bg-ink text-accent"
      >
        {glyph}
      </span>
      <h3 className="mt-5 text-[1.125rem] font-black tracking-tight">{title}</h3>
      <p className="mt-2 max-w-[19rem] text-[0.875rem] leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-6 w-full max-w-[15rem]">{action}</div>}
    </div>
  );
}
