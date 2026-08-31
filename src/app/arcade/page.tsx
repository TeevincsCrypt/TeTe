'use client';

import Link from 'next/link';
import { useState } from 'react';

import { CrossingGame } from '@/components/arcade/CrossingGame';
import { DriftGame } from '@/components/arcade/DriftGame';
import { GameGlyph } from '@/components/arcade/GameGlyph';
import { SliceGame } from '@/components/arcade/SliceGame';
import { ChevronLeftIcon, ChevronRightIcon, CrownIcon } from '@/components/shell/icons';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { GAMES, gameById, type GameId } from '@/lib/arcade/games';
import { formatNim } from '@/lib/nimiq/units';
import { useEarnings } from '@/state/use-earnings';
import { useProgress } from '@/state/use-progress';

/**
 * The arcade.
 *
 * Rewards are recorded in NIM against the player's ledger, but they are
 * unpaid: a Mini App can ask a wallet to send funds and never send funds to a
 * player, so paying out needs a treasury signing from a server. The note at the
 * foot of the screen says so rather than implying money has already moved.
 */
export default function ArcadePage() {
  const { progress, record } = useProgress();
  const { totalLuna } = useEarnings();
  const [active, setActive] = useState<GameId | null>(null);
  const [result, setResult] = useState<{ score: number; luna: number; record: boolean } | null>(null);

  function finish(id: GameId) {
    return (score: number) => {
      const outcome = record(id, score);
      setResult({ score, luna: outcome.gained, record: outcome.record });
    };
  }

  if (active) {
    const game = gameById(active);
    return (
      <div className="pt-1">
        <header className="flex items-center gap-2 pb-3">
          <button
            type="button"
            onClick={() => {
              setActive(null);
              setResult(null);
            }}
            aria-label="Back to arcade"
            className="-ml-2 flex size-10 items-center justify-center rounded-full text-muted transition-colors active:text-on-accent"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <h1 className="text-[1.0625rem] font-black tracking-tight">{game.name}</h1>
          <span className="ml-auto text-[0.75rem] font-semibold text-faint tabular">
            Best {progress.best[active] ?? '—'}
            {game.unit}
          </span>
        </header>

        <div className="overflow-hidden rounded-[1.25rem] ring-1 ring-ink/10">
          {active === 'crossing' && <CrossingGame key="crossing" onFinish={finish('crossing')} />}
          {active === 'drift' && <DriftGame key="drift" onFinish={finish('drift')} />}
          {active === 'slice' && <SliceGame key="slice" onFinish={finish('slice')} />}
        </div>

        {result && (
          <ResultBar
            game={active}
            result={result}
            onDismiss={() => setResult(null)}
            onExit={() => {
              setActive(null);
              setResult(null);
            }}
          />
        )}

        <p className="mt-3 text-center text-[0.75rem] text-faint">{game.blurb}</p>
      </div>
    );
  }

  return (
    <div className="pt-1">
      {/* An editorial header rather than another bordered card. */}
      <header className="border-b border-line pb-5">
        <p className="eyebrow text-faint">Arcade</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <h1 className="display text-[2.5rem] leading-[0.88]">
            Play.
            <br />
            Climb.
          </h1>
          <Link href="/wallet" className="pb-1 text-right active:opacity-60">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-faint">Earned</p>
            <p className="text-[1.75rem] font-black leading-none tracking-[-0.03em] tabular">
              {formatNim(totalLuna)}
              <span className="ml-1 text-[0.8125rem] text-faint">NIM</span>
            </p>
          </Link>
        </div>
      </header>

      <ul className="divide-y divide-line">
        {GAMES.map((game) => {
          const best = progress.best[game.id];
          return (
            <li key={game.id}>
              <button
                type="button"
                onClick={() => setActive(game.id)}
                className="flex w-full items-center gap-4 py-4 text-left transition-opacity active:opacity-60"
              >
                <span
                  aria-hidden
                  className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-contrast text-accent"
                >
                  <GameGlyph id={game.id} className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[1.0625rem] font-black tracking-tight">{game.name}</span>
                  <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                    {game.tagline}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[0.625rem] font-bold uppercase tracking-[0.12em] text-faint">
                    Best
                  </span>
                  <span className="block text-[0.9375rem] font-black tabular">
                    {best === undefined ? '—' : `${best}${game.unit}`}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-faint" />
              </button>
            </li>
          );
        })}
      </ul>

      <PhaseNote className="mt-6">
        Rewards are recorded on this device and are not yet payable. TeTe can only
        ask your wallet to send funds, never send funds to you, so paying these out
        needs a funded treasury that does not exist yet.
      </PhaseNote>
    </div>
  );
}

/** Result slides in under the board so the game stays on screen behind it. */
function ResultBar({
  game,
  result,
  onDismiss,
  onExit,
}: {
  game: GameId;
  result: { score: number; luna: number; record: boolean };
  onDismiss: () => void;
  onExit: () => void;
}) {
  const meta = gameById(game);
  return (
    <div className="mt-3 rounded-[1.25rem] bg-contrast p-4 text-on-contrast animate-[var(--animate-rise)]">
      <div className="flex items-center gap-3">
        {result.record && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
            <CrownIcon className="size-4.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-on-contrast/50">
            {result.record ? 'New best' : meta.scoreLabel}
          </p>
          <p className="text-[1.5rem] font-black leading-none tracking-[-0.03em] tabular">
            {result.score}
            <span className="ml-1 text-[0.8125rem] text-on-contrast/50">{meta.unit}</span>
          </p>
        </div>
        <p className="shrink-0 text-[1rem] font-black text-accent tabular">
          +{formatNim(result.luna, { maximumFractionDigits: 3 })} NIM
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            'min-h-11 flex-1 rounded-full bg-accent text-[0.875rem] font-bold text-on-accent',
            'transition-transform duration-100 active:scale-[0.97]',
          )}
        >
          Play again
        </button>
        <button
          type="button"
          onClick={onExit}
          className="min-h-11 flex-1 rounded-full border border-on-contrast/25 text-[0.875rem] font-bold transition-transform duration-100 active:scale-[0.97]"
        >
          Arcade
        </button>
      </div>
    </div>
  );
}
