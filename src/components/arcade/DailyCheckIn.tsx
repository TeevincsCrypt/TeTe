'use client';

import { useCallback, useEffect, useState } from 'react';

import { FlameIcon } from '@/components/shell/icons';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { ApiError, claimStreak, fetchStreak, type StreakState } from '@/lib/api/client';
import { formatNim } from '@/lib/nimiq/units';
import { useMiniApp } from '@/state/mini-app-provider';
import { useProgress } from '@/state/use-progress';

/**
 * The daily check-in.
 *
 * The streak and the reward both come from the server, because both decide
 * real money: a device that keeps its own calendar can claim as many "days" as
 * it likes. The local streak is still recorded alongside — it feeds personal
 * stats — but what is shown here, and what pays, is the server's.
 *
 * On a deployment without a store, this falls back to the local-only streak
 * and says plainly that it is not payable.
 */
export function DailyCheckIn() {
  const { claim, loaded, progress } = useProgress();
  const { nimiq, locale } = useMiniApp();
  const address = nimiq.address;

  const [server, setServer] = useState<StreakState | null | undefined>(undefined);
  const [burst, setBurst] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) {
      setServer(null);
      return;
    }
    setServer(await fetchStreak(address));
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!loaded || server === undefined) return null;

  const payable = server !== null;
  const streak = payable ? server.streak : progress.streak;
  const available = payable ? !server.claimedToday : false;
  const reward = payable ? server.reward : 0;

  async function check() {
    if (!address || claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const result = await claimStreak(address);
      // Keep the device's own streak record in step, for local stats.
      claim();
      setBurst(result.credited);
      setServer({ streak: result.streak, claimedToday: true, reward });
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Could not check in.');
      void refresh();
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div
      className={cn(
        'relative flex items-center gap-4 overflow-hidden rounded-2xl p-4',
        available ? 'bg-contrast' : 'bg-panel-2',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          available ? 'bg-accent text-on-accent' : 'bg-panel text-faint',
        )}
      >
        <FlameIcon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('text-[1rem] font-black tracking-tight', available && 'text-on-contrast')}>
          {streak > 0 ? `${streak} day streak` : 'Start your streak'}
        </p>
        <p
          className={cn(
            'mt-0.5 text-[0.75rem] leading-snug',
            available ? 'text-on-contrast/60' : 'text-faint',
          )}
        >
          {error
            ? error
            : !payable
              ? !address
                ? 'Connect your wallet to check in'
                : 'Check-in rewards are not configured here'
              : available
                ? `Check in for +${formatNim(reward, { locale, maximumFractionDigits: 2 })} NIM`
                : 'Checked in — come back tomorrow'}
        </p>
      </div>

      {available && (
        <button
          type="button"
          onClick={check}
          disabled={claiming}
          className="shrink-0 rounded-full bg-accent px-4 py-2.5 text-[0.8125rem] font-black text-on-accent transition-transform duration-100 active:scale-95 disabled:opacity-60"
        >
          {claiming ? 'Claiming…' : 'Claim'}
        </button>
      )}

      {burst !== null && (
        <Chip tone="gold" className="absolute right-4 top-2 animate-[var(--animate-pop)]">
          +{formatNim(burst, { locale, maximumFractionDigits: 2 })} NIM
        </Chip>
      )}
    </div>
  );
}
