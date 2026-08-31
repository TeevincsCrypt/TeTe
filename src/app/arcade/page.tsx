'use client';

import { useState } from 'react';

import { MemoryGame } from '@/components/arcade/MemoryGame';
import { ReflexGame } from '@/components/arcade/ReflexGame';
import { SprintGame } from '@/components/arcade/SprintGame';
import { ChevronLeftIcon } from '@/components/shell/icons';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { GAMES, gameById, type GameId } from '@/lib/arcade/games';
import { useProgress } from '@/state/use-progress';

/**
 * The arcade: short, genuinely playable skill games that build XP.
 *
 * XP is an off-chain score kept on this device. It is deliberately NOT NIM, and
 * the screen says so — TeTe has no way to send anyone NIM (see
 * `lib/arcade/progress.ts` for why), so presenting XP as a token payout would be
 * a promise the app cannot keep.
 */
export default function ArcadePage() {
  const { progress, record } = useProgress();
  const [active, setActive] = useState<GameId | null>(null);
  const [result, setResult] = useState<{ score: number; xp: number; record: boolean } | null>(null);

  function finish(id: GameId) {
    return (score: number, xp: number) => {
      const outcome = record(id, score, xp);
      setResult({ score, xp: outcome.gained, record: outcome.record });
    };
  }

  if (active) {
    const game = gameById(active);
    return (
      <div className="space-y-5 pt-2">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setActive(null);
              setResult(null);
            }}
            aria-label="Back to arcade"
            className="-ml-2 flex size-11 items-center justify-center rounded-full text-muted transition-colors active:text-text"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <div>
            <Eyebrow className="text-faint">{game.tagline}</Eyebrow>
            <h1 className="display mt-1 text-[1.75rem]">{game.name}</h1>
          </div>
        </header>

        {result ? (
          <ResultCard
            game={active}
            result={result}
            onAgain={() => setResult(null)}
            onExit={() => {
              setActive(null);
              setResult(null);
            }}
          />
        ) : (
          <Sticker tone="panel">
            {active === 'reflex' && <ReflexGame key="reflex" onFinish={finish('reflex')} />}
            {active === 'memory' && <MemoryGame key="memory" onFinish={finish('memory')} />}
            {active === 'sprint' && <SprintGame key="sprint" onFinish={finish('sprint')} />}
          </Sticker>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-2">
      <header>
        <Eyebrow className="text-faint">Play. Earn XP.</Eyebrow>
        <h1 className="display mt-1 text-[2rem]">Arcade</h1>
      </header>

      <Sticker tone="contrast">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Eyebrow className="text-on-contrast/55">Your XP</Eyebrow>
            <p className="display mt-1 text-[2.5rem] text-on-contrast tabular">
              {progress.xp.toLocaleString()}
            </p>
          </div>
          <Chip tone="inverse">{progress.plays} plays</Chip>
        </div>
      </Sticker>

      <section className="space-y-3">
        {GAMES.map((game) => {
          const best = progress.best[game.id];
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => setActive(game.id)}
              className={cn(
                'flex w-full items-center gap-4 rounded-[var(--radius-sticker)] border-2 border-ink bg-panel p-4 text-left',
                'shadow-[var(--shadow-sticker)] transition-transform duration-100',
                'active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
              )}
            >
              <span
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 border-ink bg-accent text-[1.5rem]"
              >
                {game.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="display block text-[1.25rem]">{game.name}</span>
                <span className="mt-0.5 block text-[0.75rem] text-faint">{game.tagline}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="eyebrow block text-faint">Best</span>
                <span className="block text-[1rem] font-black tabular">
                  {best === undefined ? '—' : `${best}${game.unit}`}
                </span>
              </span>
            </button>
          );
        })}
      </section>

      <PhaseNote>
        XP is a local score on this device — it is not NIM and it is not on any
        chain. TeTe can only ask your wallet to send funds, never send funds to
        you, so paying real rewards needs a funded treasury that does not exist
        yet. XP is the ledger a payout would eventually read.
      </PhaseNote>
    </div>
  );
}

function ResultCard({
  game,
  result,
  onAgain,
  onExit,
}: {
  game: GameId;
  result: { score: number; xp: number; record: boolean };
  onAgain: () => void;
  onExit: () => void;
}) {
  const meta = gameById(game);
  return (
    <div className="flex flex-col items-center py-6 text-center animate-[var(--animate-pop)]">
      <span
        aria-hidden
        className="flex size-20 items-center justify-center rounded-full border-2 border-ink bg-accent text-[2rem] shadow-[var(--shadow-sticker)]"
      >
        {result.record ? '👑' : meta.icon}
      </span>
      {result.record && (
        <Chip tone="gold" className="mt-4">
          New personal best
        </Chip>
      )}
      <p className="display mt-4 text-[2.5rem] tabular">
        {result.score}
        <span className="ml-1 text-[1rem] text-faint">{meta.unit}</span>
      </p>
      <p className="mt-2 text-[1rem] font-black text-accent-text tabular">+{result.xp} XP</p>

      <div className="mt-7 w-full max-w-[16rem] space-y-2.5">
        <Button onClick={onAgain}>Play again</Button>
        <Button variant="outline" onClick={onExit}>
          Back to arcade
        </Button>
      </div>
    </div>
  );
}
