import { cn } from './cn';

/**
 * Slow-rotating rays behind the hero. Decorative only, and cheap: one SVG with
 * a compositor-only rotation, hidden from assistive tech.
 */
export function Sunburst({ className }: { className?: string }) {
  const rays = Array.from({ length: 24 }, (_, index) => index);

  return (
    <svg
      viewBox="0 0 200 200"
      className={cn('pointer-events-none absolute animate-[var(--animate-spin-slow)]', className)}
      aria-hidden
    >
      {rays.map((ray) => (
        <path
          key={ray}
          d="M100 100 L96 0 L104 0 Z"
          fill="currentColor"
          transform={`rotate(${ray * 15} 100 100)`}
        />
      ))}
    </svg>
  );
}
