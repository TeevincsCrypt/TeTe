import type { ReactNode } from 'react';

import { cn } from './cn';

/** The one surface primitive: a soft-bordered panel on the near-black ground. */
export function Card({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  /** Tints the top hairline, used to tell the NIM and USDT cards apart. */
  accent?: 'accent' | 'violet';
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-card)] border border-line-soft bg-surface p-5',
        className,
      )}
    >
      {accent && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-x-5 top-0 h-px',
            accent === 'accent'
              ? 'bg-linear-to-r from-transparent via-accent to-transparent'
              : 'bg-linear-to-r from-transparent via-violet to-transparent',
          )}
        />
      )}
      {children}
    </section>
  );
}

export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-faint">
      {children}
    </p>
  );
}
