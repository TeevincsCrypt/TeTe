import type { ReactNode } from 'react';

import { cn } from './cn';

type Tone = 'contrast' | 'panel' | 'accent' | 'violet' | 'outline';

const TONES: Record<Tone, string> = {
  contrast: 'bg-contrast text-on-contrast border-transparent',
  panel: 'bg-panel-2 text-text border-transparent',
  accent: 'bg-accent text-on-accent border-transparent',
  violet: 'bg-violet text-white border-transparent',
  outline: 'bg-transparent text-text border-line',
};

/**
 * The one surface primitive. A hard, blur-free shadow plus a solid border is
 * what separates this from the glassy card every Web3 dashboard reaches for.
 */
export function Sticker({
  tone = 'panel',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border p-5',
        TONES[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn('eyebrow', className)}>{children}</p>;
}
