'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FormatArt } from '@/components/challenges/FormatArt';
import { ChevronLeftIcon } from '@/components/shell/icons';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { ApiError, createBracket, fetchStatus, type BackendStatus } from '@/lib/api/client';
import { BRACKET_SIZES, type BracketSize } from '@/lib/bracket/types';
import { CHALLENGE_FORMATS, formatById, type ChallengeFormatId } from '@/lib/challenges/types';
import { nimToLuna } from '@/lib/nimiq/units';
import { pushNotice } from '@/lib/notifications/notifications';
import { useMiniApp } from '@/state/mini-app-provider';
import type { StakeCurrency } from '@/types';

function toSmallestUnit(currency: StakeCurrency, value: number): number {
  return currency === 'NIM' ? nimToLuna(value) : Math.round(value * 100);
}

const QUICK_STAKES: Record<StakeCurrency, readonly number[]> = {
  NIM: [50, 100, 500, 1000],
  USDT: [1, 5, 10, 25],
};

/**
 * Start a tournament: pick the game, the size, and the stake per match. Just
 * one screen — a bracket is a much smaller decision than a single challenge,
 * since there is no opponent to name; the field fills itself.
 */
export default function CreateBracketPage() {
  const router = useRouter();
  const { nimiq } = useMiniApp();

  const [format, setFormat] = useState<ChallengeFormatId | null>(null);
  const [size, setSize] = useState<BracketSize>(4);
  const [currency, setCurrency] = useState<StakeCurrency>('NIM');
  const [stake, setStake] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<BackendStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stakeValue = Number.parseFloat(stake);
  const stakeValid = Number.isFinite(stakeValue) && stakeValue > 0;
  const canSubmit = format !== null && stakeValid;
  const canPost = status?.escrow === true && Boolean(nimiq.address);

  async function submit() {
    if (!format || !stakeValid || !nimiq.address) return;
    setPosting(true);
    setError(null);
    try {
      const bracket = await createBracket(nimiq.address, {
        format,
        currency,
        stake: toSmallestUnit(currency, stakeValue),
        size,
      });
      pushNotice(
        'challenge',
        'Tournament started',
        `${formatById(format).name} · ${size} players · waiting for the field to fill`,
        `/brackets/${bracket.id}`,
      );
      router.push(`/brackets/${bracket.id}`);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Could not start that tournament.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-5 pt-2">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/brackets')}
          aria-label="Back"
          className="-ml-2 flex size-11 items-center justify-center rounded-full text-muted transition-colors active:text-text"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <h1 className="display text-[1.75rem]">Start a tournament</h1>
      </header>

      <div className="space-y-3">
        <Eyebrow className="text-faint">Game</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          {CHALLENGE_FORMATS.map((option) => {
            const active = option.id === format;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFormat(option.id)}
                aria-pressed={active}
                className={cn(
                  'overflow-hidden rounded-2xl text-left transition-all duration-150 active:scale-[0.97]',
                  active ? 'bg-contrast text-on-contrast ring-2 ring-accent' : 'bg-panel-2 text-text',
                )}
              >
                <FormatArt id={option.id} rounded="rounded-none" className="h-16 w-full" />
                <span className="block p-3.5">
                  <span className="block text-[1rem] font-black tracking-tight">{option.name}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <Eyebrow className="text-faint">Size</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          {BRACKET_SIZES.map((option) => {
            const active = option === size;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setSize(option)}
                aria-pressed={active}
                className={cn(
                  'min-h-16 rounded-2xl text-[1rem] font-black tracking-tight transition-all duration-150 active:scale-[0.97]',
                  active
                    ? 'border-line bg-accent text-on-accent shadow-[var(--shadow-sticker)]'
                    : 'border-line bg-panel-2 text-muted',
                )}
              >
                {option} players
                <span className="mt-0.5 block text-[0.6875rem] font-bold opacity-70">
                  {Math.log2(option)} round{option > 2 ? 's' : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <Eyebrow className="text-faint">Stake per match</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          {(['NIM', 'USDT'] as const).map((option) => {
            const active = option === currency;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setCurrency(option)}
                aria-pressed={active}
                className={cn(
                  'min-h-14 rounded-full text-[1rem] font-black tracking-tight transition-all duration-150 active:scale-[0.97]',
                  active
                    ? option === 'NIM'
                      ? 'border-line bg-accent text-on-accent shadow-[var(--shadow-sticker)]'
                      : 'border-line bg-violet text-white shadow-[var(--shadow-sticker)]'
                    : 'border-line bg-panel text-muted',
                )}
              >
                {option}
              </button>
            );
          })}
        </div>

        <Sticker tone="panel">
          <label htmlFor="stake" className="eyebrow text-faint">
            Stake per player, per match
          </label>
          <div className="mt-2 flex items-baseline gap-2">
            <input
              id="stake"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={stake}
              onChange={(event) => setStake(event.target.value)}
              placeholder="0"
              className="w-full min-w-0 bg-transparent text-[2.25rem] font-black tracking-[-0.03em] text-text tabular placeholder:text-faint focus:outline-none"
            />
            <span className="shrink-0 text-[1rem] font-black text-faint">{currency}</span>
          </div>
          <div className="mt-3 flex gap-2">
            {QUICK_STAKES[currency].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setStake(String(amount))}
                className="min-h-10 flex-1 rounded-full border-2 border-line text-[0.8125rem] font-bold text-muted transition-colors active:border-accent active:text-accent-text"
              >
                {amount}
              </button>
            ))}
          </div>
        </Sticker>

        <p className="text-[0.75rem] leading-relaxed text-faint">
          Every player stakes this amount for each match they play. The winner of each round
          takes both stakes, same as any other challenge.
        </p>
      </div>

      <div className="space-y-3">
        <Button onClick={submit} disabled={!canSubmit || !canPost} loading={posting} size="lg">
          Start tournament
        </Button>
        {error && (
          <p role="alert" className="text-[0.8125rem] font-semibold text-negative">
            {error}
          </p>
        )}
        <PhaseNote>
          {status === null
            ? 'Checking what this deployment can do…'
            : !canPost
              ? !status.escrow
                ? 'Escrow is not configured on this deployment, so tournaments cannot be started here.'
                : 'Connect your wallet to start a tournament.'
              : 'Starting asks Nimiq Pay to sign it — no money moves until you actually play a match. The bracket fills as players join, then seeds randomly.'}
        </PhaseNote>
      </div>
    </div>
  );
}
