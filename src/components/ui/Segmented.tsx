'use client';

import { cn } from './cn';

/**
 * Tab switcher. The active pill is a solid accent chip, matching the way the
 * primary button reads, so "where am I" and "what can I press" use one language.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-1 rounded-full bg-panel-2 p-1', className)}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3',
              'text-[0.8125rem] font-bold tracking-tight transition-colors duration-150',
              active ? 'bg-ink text-on-contrast' : 'text-muted active:bg-panel',
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[0.625rem] font-black tabular',
                  active ? 'bg-on-contrast/20 text-on-contrast' : 'bg-panel text-faint',
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
