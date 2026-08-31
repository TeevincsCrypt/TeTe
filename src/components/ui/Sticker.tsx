import type { ReactNode } from 'react';

import { cn } from './cn';

type Tone = 'cream' | 'panel' | 'lime' | 'violet' | 'outline';

const TONES: Record<Tone, string> = {
  cream: 'bg-cream text-ink border-ink shadow-[var(--shadow-sticker)]',
  panel: 'bg-panel text-text border-line shadow-none',
  lime: 'bg-lime text-ink border-ink shadow-[var(--shadow-sticker)]',
  violet: 'bg-violet text-white border-ink shadow-[var(--shadow-sticker)]',
  outline: 'bg-transparent text-text border-line shadow-none',
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
        'relative rounded-[var(--radius-sticker)] border-2 p-5',
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
