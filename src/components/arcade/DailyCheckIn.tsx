'use client';

import { useState } from 'react';

import { FlameIcon } from '@/components/shell/icons';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { checkInReward } from '@/lib/arcade/progress';
import { formatNim } from '@/lib/nimiq/units';
import { useProgress } from '@/state/use-progress';

/**
 * The daily check-in.
 *
 * The streak is real: it counts consecutive local days claimed, resets on a
 * missed day, and the reward grows with it before plateauing. What it pays is
 * NIM into the rewards ledger — recorded but unpaid, because a Mini App
 * cannot send funds to a player. See lib/wallet/earnings.ts.
 */
export function DailyCheckIn() {
  const { progress, claim, checkInAvailable, loaded } = useProgress();
  const [burst, setBurst] = useState<number | null>(null);

  if (!loaded) return null;

  const nextReward = Math.round(checkInReward(progress.streak + (checkInAvailable ? 1 : 0)));

  return (
    <div
      className={cn(
        'relative flex items-center gap-4 overflow-hidden rounded-2xl p-4',
        checkInAvailable ? 'bg-contrast' : 'bg-panel-2',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          checkInAvailable ? 'bg-accent text-on-accent' : 'bg-panel text-faint',
        )}
      >
        <FlameIcon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[1rem] font-black tracking-tight',
            checkInAvailable && 'text-on-contrast',
          )}
        >
          {progress.streak > 0 ? `${progress.streak} day streak` : 'Start your streak'}
        </p>
        <p
          className={cn(
            'mt-0.5 text-[0.75rem] leading-snug',
            checkInAvailable ? 'text-on-contrast/60' : 'text-faint',
          )}
        >
          {checkInAvailable
            ? `Check in for +${formatNim(nextReward, { maximumFractionDigits: 2 })} NIM`
            : 'Checked in — come back tomorrow'}
        </p>
      </div>

      {checkInAvailable && (
        <button
          type="button"
          onClick={() => setBurst(claim().gained)}
          className="shrink-0 rounded-full bg-accent px-4 py-2.5 text-[0.8125rem] font-black text-on-accent transition-transform duration-100 active:scale-95"
        >
          Claim
        </button>
      )}

      {burst !== null && (
        <Chip
          tone="gold"
          className="absolute right-4 top-2 animate-[var(--animate-pop)]"
        >
          +{formatNim(burst, { maximumFractionDigits: 2 })} NIM
        </Chip>
      )}
    </div>
  );
}
