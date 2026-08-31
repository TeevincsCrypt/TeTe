import { Fragment } from 'react';

import { cn } from './cn';

/**
 * Infinite ticker. The track holds the items twice and slides exactly -50%, so
 * the loop is seamless. Animating a single `transform` keeps it on the
 * compositor — no layout work per frame, which is what makes it safe on a phone.
 */
export function Marquee({
  items,
  className,
}: {
  items: readonly string[];
  className?: string;
}) {
  return (
    <div className={cn('relative overflow-hidden', className)} aria-hidden>
      <div className="flex w-max animate-[var(--animate-marquee)] will-change-transform">
        {[0, 1].map((copy) => (
          <Fragment key={copy}>
            {items.map((item, index) => (
              <span
                key={`${copy}-${item}-${index}`}
                className="flex items-center gap-3 whitespace-nowrap px-4 text-[0.8125rem] font-black uppercase tracking-[0.1em]"
              >
                {item}
                <span aria-hidden className="size-1.5 rotate-45 bg-accent" />
              </span>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
