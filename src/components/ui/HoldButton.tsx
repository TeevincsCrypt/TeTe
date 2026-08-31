'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from './cn';

const HOLD_MS = 800;
/** Geometry lives in one place so the ring can be resized without maths. */
const VIEW = 100;
const R = 43;
const STROKE = 4.5;
const CIRCUMFERENCE = 2 * Math.PI * R;

type Phase = 'idle' | 'holding' | 'done';

/**
 * Hold-to-confirm, with an SVG progress ring.
 *
 * On press the ring's `stroke-dashoffset` runs from full to 0 over 800ms
 * linear. Hold the whole way and it fires `onConfirm` and flashes success;
 * release early and it cancels and the ring snaps back.
 *
 * The label sits below the dial rather than inside it — text crammed into a
 * circle has to shrink to fit and ends up illegible at exactly the moment the
 * player is deciding whether to commit.
 */
export function HoldButton({
  label,
  holdingLabel = 'Keep holding',
  doneLabel = 'Opening',
  onConfirm,
  className,
}: {
  label: string;
  holdingLabel?: string;
  doneLabel?: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => () => {
    clear();
    if (reset.current) clearTimeout(reset.current);
  }, []);

  const start = useCallback(() => {
    if (phase === 'done') return;
    setPhase('holding');
    clear();
    timer.current = setTimeout(() => {
      setPhase('done');
      onConfirm();
      reset.current = setTimeout(() => setPhase('idle'), 2200);
    }, HOLD_MS);
  }, [onConfirm, phase]);

  const cancel = useCallback(() => {
    setPhase((current) => {
      if (current !== 'holding') return current;
      clear();
      return 'idle';
    });
  }, []);

  const filling = phase === 'holding';
  const complete = phase === 'done';

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <button
        type="button"
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        aria-label={label}
        className="relative flex size-[7.5rem] select-none items-center justify-center rounded-full"
        style={{ touchAction: 'none' }}
      >
        {/* A soft halo that blooms while the ring fills. */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 rounded-full transition-all duration-300',
            complete ? 'bg-positive/25 scale-105' : filling ? 'bg-accent/20 scale-100' : 'bg-transparent scale-90',
          )}
        />

        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="absolute inset-0 size-full -rotate-90">
          <circle
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-on-contrast/20"
          />
          <circle
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={R}
            fill="none"
            stroke={complete ? 'var(--color-positive)' : 'var(--color-accent)'}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={filling || complete ? 0 : CIRCUMFERENCE}
            style={{
              // Filling runs the full 800ms linear; releasing snaps straight back.
              transition: filling ? `stroke-dashoffset ${HOLD_MS}ms linear` : 'none',
            }}
          />
        </svg>

        {/* Inner disc holds the glyph, so the ring stays uncluttered. */}
        <span
          className={cn(
            'relative flex size-[5.25rem] items-center justify-center rounded-full',
            'transition-all duration-200',
            complete
              ? 'bg-positive text-white'
              : filling
                ? 'scale-95 bg-accent text-on-accent'
                : 'bg-on-contrast/12 text-on-contrast ring-1 ring-inset ring-on-contrast/15',
          )}
        >
          {complete ? (
            <svg viewBox="0 0 24 24" fill="none" className="size-8" aria-hidden>
              <path d="m4 12 5.5 5.5L20 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="size-8" aria-hidden>
              <path d="M13 4 21 12 13 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 12h17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          )}
        </span>
      </button>

      <p
        className={cn(
          'mt-4 text-center text-[0.8125rem] font-bold transition-colors duration-200',
          complete ? 'text-positive' : filling ? 'text-accent' : 'text-on-contrast',
        )}
      >
        {complete ? doneLabel : filling ? holdingLabel : label}
      </p>
    </div>
  );
}
