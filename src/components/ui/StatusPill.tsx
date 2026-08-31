import type { ReactNode } from 'react';

import { cn } from './cn';

type Tone = 'neutral' | 'positive' | 'caution' | 'negative' | 'accent';

const TONES: Record<Tone, { dot: string; text: string }> = {
  neutral: { dot: 'bg-faint', text: 'text-muted' },
  positive: { dot: 'bg-positive', text: 'text-positive' },
  caution: { dot: 'bg-caution', text: 'text-caution' },
  negative: { dot: 'bg-negative', text: 'text-negative' },
  accent: { dot: 'bg-accent', text: 'text-accent' },
};

export function StatusPill({
  tone = 'neutral',
  pulse = false,
  children,
}: {
  tone?: Tone;
  /** Reserved for live state, e.g. consensus established. */
  pulse?: boolean;
  children: ReactNode;
}) {
  const { dot, text } = TONES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line-soft bg-surface-2 px-2.5 py-1',
        'text-[0.6875rem] font-medium tracking-tight',
        text,
      )}
    >
      <span className={cn('size-1.5 rounded-full', dot, pulse && 'animate-pulse')} />
      {children}
    </span>
  );
}
