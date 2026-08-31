'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

type Phase = 'idle' | 'showing' | 'input' | 'over';
const SIZE = 9;

/**
 * Reproduce a growing sequence on a 3×3 grid.
 *
 * The sequence is generated randomly, but the score is how far the player's
 * memory carries them — the challenge is recall, not luck. One wrong tap ends
 * the run, so the level reached is a clean skill measure.
 */
export function MemoryGame({ onFinish }: { onFinish: (level: number, xp: number) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [sequence, setSequence] = useState<number[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const play = useCallback((seq: number[]) => {
    setPhase('showing');
    clearTimers();
    seq.forEach((cell, index) => {
      timers.current.push(setTimeout(() => setLit(cell), index * 620 + 250));
      timers.current.push(setTimeout(() => setLit(null), index * 620 + 620));
    });
    timers.current.push(
      setTimeout(() => {
        setStep(0);
        setPhase('input');
      }, seq.length * 620 + 300),
    );
  }, []);

  const next = useCallback(() => {
    const seq = [...sequence, Math.floor(Math.random() * SIZE)];
    setSequence(seq);
    play(seq);
  }, [sequence, play]);

  function start() {
    setSequence([]);
    setStep(0);
    const seq = [Math.floor(Math.random() * SIZE)];
    setSequence(seq);
    play(seq);
  }

  function tap(cell: number) {
    if (phase !== 'input') return;

    if (sequence[step] !== cell) {
      // The level *completed* is the one before the level being attempted.
      const level = sequence.length - 1;
      clearTimers();
      setPhase('over');
      onFinish(level, Math.max(2, level * 8));
      return;
    }

    if (step + 1 === sequence.length) next();
    else setStep(step + 1);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="eyebrow text-faint">Level</span>
        <span className="text-[1.25rem] font-black tabular">{Math.max(sequence.length, 0)}</span>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: SIZE }, (_, cell) => (
          <button
            key={cell}
            type="button"
            onClick={() => tap(cell)}
            disabled={phase !== 'input'}
            aria-label={`Cell ${cell + 1}`}
            className={cn(
              'aspect-square rounded-2xl border-2 transition-all duration-100',
              lit === cell
                ? 'scale-95 border-ink bg-accent'
                : 'border-ink/15 bg-panel active:bg-panel-2',
              phase === 'input' && 'border-ink/30',
            )}
          />
        ))}
      </div>

      {(phase === 'idle' || phase === 'over') && (
        <Button className="mt-5" onClick={start}>
          {phase === 'over' ? 'Play again' : 'Start'}
        </Button>
      )}
      {phase === 'showing' && (
        <p className="mt-5 text-center text-[0.8125rem] font-bold text-muted">Watch…</p>
      )}
      {phase === 'input' && (
        <p className="mt-5 text-center text-[0.8125rem] font-bold text-accent-text">Your turn</p>
      )}
    </div>
  );
}
