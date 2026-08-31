'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from './cn';

interface Pill {
  left: number;
  width: number;
}

/**
 * Segmented control with a pill that slides between tabs.
 *
 * On selection the target button's `offsetLeft` and `offsetWidth` are measured
 * and the pill animates its `left` and `width` to match over ~0.4s on
 * cubic-bezier(0.65, 0, 0.35, 1); the label colour crossfades as it arrives.
 *
 * Measuring after layout (rather than assuming equal widths) is what lets tabs
 * carry counts of different lengths without the pill drifting off them.
 */
export function SlidingTabs<T extends string>({
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
  const listRef = useRef<HTMLDivElement | null>(null);
  const [pill, setPill] = useState<Pill | null>(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;
    setPill({ left: active.offsetLeft, width: active.offsetWidth });
  }, []);

  useLayoutEffect(measure, [measure, value, options.length]);

  useEffect(() => {
    if (!listRef.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(listRef.current);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div ref={listRef} role="tablist" className={cn('relative flex rounded-full bg-panel-2 p-1', className)}>
      {pill && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-full bg-contrast"
          style={{
            left: pill.left,
            width: pill.width,
            transition: 'left 0.4s cubic-bezier(0.65,0,0.35,1), width 0.4s cubic-bezier(0.65,0,0.35,1)',
          }}
        />
      )}

      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            role="tab"
            aria-selected={active}
            data-active={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'relative z-10 flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3',
              'text-[0.8125rem] font-bold tracking-tight',
              // The crossfade lags the pill slightly so the colour lands with it.
              'transition-colors duration-300 ease-out',
              active ? 'text-on-contrast' : 'text-muted',
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[0.625rem] font-black tabular transition-colors duration-300',
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
