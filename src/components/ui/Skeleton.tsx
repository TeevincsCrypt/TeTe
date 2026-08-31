import { cn } from './cn';

/** Placeholder for a value that is genuinely loading — never for missing data. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('block rounded-lg bg-panel-2 animate-[var(--animate-shimmer)]', className)}
    />
  );
}
