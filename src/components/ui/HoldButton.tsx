'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from './cn';

const HOLD_MS = 800;
const R = 34;
const CIRCUMFERENCE = 2 * Math.PI * R;

type Phase = 'idle' | 'holding' | 'done';

/**
 * Hold-to-confirm, with an SVG progress ring.
 *
 * On press the ring's `stroke-dashoffset` runs from full to 0 over 800ms
 * linear. Hold the whole way and it fires `onConfirm` and flashes a success
 * state; release early and it cancels and the ring snaps back.
 *
 * The deliberate press is the point: this guards an action that hands the
 * player off to another app, which is not something a stray tap should do.
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

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const start = useCallback(() => {
    if (phase === 'done') return;
    setPhase('holding');
    clear();
    timer.current = setTimeout(() => {
      setPhase('done');
      onConfirm();
      timer.current = setTimeout(() => setPhase('idle'), 1400);
    }, HOLD_MS);
  }, [onConfirm, phase]);

  const cancel = useCallback(() => {
    if (phase !== 'holding') return;
    clear();
    setPhase('idle');
  }, [phase]);

  const filling = phase === 'holding';
  const complete = phase === 'done';

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      aria-label={label}
      className={cn(
        'relative flex size-24 select-none items-center justify-center rounded-full',
        'transition-colors duration-200',
        complete ? 'bg-positive text-on-accent' : 'bg-contrast text-on-contrast',
        className,
      )}
      style={{ touchAction: 'none' }}
    >
      <svg viewBox="0 0 80 80" className="absolute inset-0 size-full -rotate-90">
        <circle cx="40" cy="40" r={R} fill="none" stroke="currentColor" strokeWidth="4" opacity="0.18" />
        <circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          stroke={complete ? 'currentColor' : 'var(--color-accent)'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={filling || complete ? 0 : CIRCUMFERENCE}
          style={{
            // Filling runs the full 800ms linear; releasing snaps straight back.
            transition: filling ? `stroke-dashoffset ${HOLD_MS}ms linear` : 'none',
          }}
        />
      </svg>

      <span className="relative px-3 text-center text-[0.6875rem] font-black uppercase leading-tight tracking-wider">
        {complete ? doneLabel : filling ? holdingLabel : label}
      </span>
    </button>
  );
}
