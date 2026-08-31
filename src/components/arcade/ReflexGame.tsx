'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

type Phase = 'idle' | 'waiting' | 'go' | 'tooSoon' | 'done';
const ROUNDS = 3;

/**
 * Reaction time over three rounds, scored on the average.
 *
 * The delay before each "go" is randomised, but nothing about the *outcome* is:
 * the score is the player's own reaction speed. Randomising the wait only stops
 * it being anticipated, which is what makes it a measure of reflex rather than
 * rhythm. Tapping early is caught and voids the round.
 */
export function ReflexGame({ onFinish }: { onFinish: (avgMs: number, xp: number) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [times, setTimes] = useState<number[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const arm = useCallback(() => {
    setPhase('waiting');
    clear();
    timer.current = setTimeout(
      () => {
        startedAt.current = performance.now();
        setPhase('go');
      },
      1200 + Math.random() * 2600,
    );
  }, []);

  function tap() {
    if (phase === 'idle' || phase === 'tooSoon') return arm();

    if (phase === 'waiting') {
      clear();
      setPhase('tooSoon');
      return;
    }

    if (phase === 'go') {
      const ms = Math.round(performance.now() - startedAt.current);
      const next = [...times, ms];
      setTimes(next);

      if (next.length >= ROUNDS) {
        const avg = Math.round(next.reduce((a, b) => a + b, 0) / next.length);
        // Faster is worth more, floored so a slow run still pays something.
        const xp = Math.max(5, Math.min(60, Math.round((650 - avg) / 10)));
        setPhase('done');
        onFinish(avg, xp);
      } else {
        arm();
      }
    }
  }

  const copy: Record<Phase, { title: string; body: string }> = {
    idle: { title: 'Tap to start', body: `Best of ${ROUNDS} rounds.` },
    waiting: { title: 'Wait…', body: 'Tap the instant it turns orange.' },
    go: { title: 'TAP!', body: '' },
    tooSoon: { title: 'Too soon', body: 'Tap to try that round again.' },
    done: { title: 'Done', body: '' },
  };

  return (
    <div>
      <button
        type="button"
        onClick={tap}
        disabled={phase === 'done'}
        aria-label="Reflex target"
        className={cn(
          'flex h-64 w-full flex-col items-center justify-center rounded-[var(--radius-sticker)] border-2 border-ink',
          'transition-colors duration-75',
          phase === 'go' ? 'bg-accent text-on-accent' : 'bg-contrast text-on-contrast',
          phase === 'tooSoon' && 'bg-negative text-white',
        )}
      >
        <span className="display text-[2.25rem]">{copy[phase].title}</span>
        {copy[phase].body && (
          <span className="mt-2 max-w-[16rem] px-6 text-center text-[0.8125rem] opacity-70">
            {copy[phase].body}
          </span>
        )}
      </button>

      <div className="mt-4 flex justify-center gap-2">
        {Array.from({ length: ROUNDS }, (_, index) => (
          <span
            key={index}
            className={cn(
              'flex h-9 min-w-14 items-center justify-center rounded-full border-2 text-[0.75rem] font-black tabular',
              times[index] !== undefined
                ? 'border-ink bg-panel text-ink'
                : 'border-ink/15 text-faint',
            )}
          >
            {times[index] !== undefined ? `${times[index]}` : '—'}
          </span>
        ))}
      </div>

      {phase === 'idle' && (
        <Button className="mt-4" onClick={arm}>
          Start
        </Button>
      )}
    </div>
  );
}
