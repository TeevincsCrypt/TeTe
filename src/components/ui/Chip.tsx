import type { ReactNode } from 'react';

import { cn } from './cn';

type Tone = 'neutral' | 'lime' | 'violet' | 'flame' | 'gold' | 'positive' | 'warn';

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-panel-2 text-muted',
  lime: 'border-lime/40 bg-lime/10 text-lime',
  violet: 'border-violet/40 bg-violet/15 text-violet',
  flame: 'border-flame/40 bg-flame/15 text-flame',
  gold: 'border-gold/40 bg-gold/15 text-gold',
  positive: 'border-positive/40 bg-positive/15 text-positive',
  warn: 'border-gold/50 bg-gold/10 text-gold',
};

/** Small status/marker pill. Also the "not live yet" marker used app-wide. */
export function Chip({
  tone = 'neutral',
  dot = false,
  pulse = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1',
        'text-[0.6875rem] font-bold tracking-tight',
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span className={cn('size-1.5 rounded-full bg-current', pulse && 'animate-pulse')} />
      )}
      {children}
    </span>
  );
}
