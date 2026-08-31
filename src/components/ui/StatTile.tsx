import type { ReactNode } from 'react';

import { cn } from './cn';

type Accent = 'lime' | 'violet' | 'flame' | 'gold' | 'plain';

const ACCENTS: Record<Accent, string> = {
  lime: 'text-lime',
  violet: 'text-violet',
  flame: 'text-flame',
  gold: 'text-gold',
  plain: 'text-text',
};

/**
 * A single number with its label. `value` is whatever the caller has — when
 * there is genuinely nothing to show it passes an em dash, so a tile never
 * implies a measurement TeTe has not actually taken.
 */
export function StatTile({
  label,
  value,
  suffix,
  accent = 'plain',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  accent?: Accent;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border-2 border-line bg-panel p-3.5',
        'transition-transform duration-150 active:scale-[0.97]',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-[0.8125rem] leading-none">{icon}</span>}
        <p className="eyebrow text-faint">{label}</p>
      </div>
      <p className={cn('mt-2 text-[1.5rem] font-black leading-none tracking-[-0.03em] tabular', ACCENTS[accent])}>
        {value}
        {suffix && <span className="ml-1 text-[0.8125rem] font-bold text-faint">{suffix}</span>}
      </p>
    </div>
  );
}
