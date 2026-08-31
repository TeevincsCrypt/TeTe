'use client';

import { useState } from 'react';

import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { checkInReward } from '@/lib/arcade/progress';
import { useProgress } from '@/state/use-progress';

/**
 * The daily check-in.
 *
 * The streak is real: it counts consecutive local days claimed, resets on a
 * missed day, and the reward grows with it before plateauing. What it pays is
 * XP — an off-chain score — because TeTe has no way to send a player NIM.
 */
export function DailyCheckIn() {
  const { progress, claim, checkInAvailable, loaded } = useProgress();
  const [burst, setBurst] = useState<number | null>(null);

  if (!loaded) return null;

  const nextReward = checkInReward(progress.streak + (checkInAvailable ? 1 : 0));

  return (
    <div
      className={cn(
        'relative flex items-center gap-4 overflow-hidden rounded-[var(--radius-sticker)] border-2 p-4',
        checkInAvailable ? 'border-ink bg-accent shadow-[var(--shadow-sticker)]' : 'border-ink/12 bg-panel',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 border-ink text-[1.5rem]',
          checkInAvailable ? 'bg-panel' : 'bg-panel-2',
        )}
      >
        🔥
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('display text-[1.125rem]', checkInAvailable && 'text-on-accent')}>
          {progress.streak > 0 ? `${progress.streak} day streak` : 'Start your streak'}
        </p>
        <p
          className={cn(
            'mt-0.5 text-[0.75rem] leading-snug',
            checkInAvailable ? 'text-on-accent/70' : 'text-faint',
          )}
        >
          {checkInAvailable ? `Check in for +${nextReward} XP` : 'Checked in — come back tomorrow'}
        </p>
      </div>

      {checkInAvailable && (
        <button
          type="button"
          onClick={() => setBurst(claim().gained)}
          className="shrink-0 rounded-full border-2 border-ink bg-panel px-4 py-2.5 text-[0.8125rem] font-black shadow-[var(--shadow-sticker-sm)] transition-transform duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          Claim
        </button>
      )}

      {burst !== null && (
        <Chip
          tone="gold"
          className="absolute right-4 top-2 animate-[var(--animate-pop)]"
        >
          +{burst} XP
        </Chip>
      )}
    </div>
  );
}
