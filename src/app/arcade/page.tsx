'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AlleyGame } from '@/components/arcade/AlleyGame';
import { CrossingGame } from '@/components/arcade/CrossingGame';
import { DriftGame } from '@/components/arcade/DriftGame';
import { GameGlyph } from '@/components/arcade/GameGlyph';
import { InvasionGame } from '@/components/arcade/InvasionGame';
import { OverheatGame } from '@/components/arcade/OverheatGame';
import { PitchGame } from '@/components/arcade/PitchGame';
import { RushGame } from '@/components/arcade/RushGame';
import { SliceGame } from '@/components/arcade/SliceGame';
import { ChevronLeftIcon, ChevronRightIcon, CrownIcon } from '@/components/shell/icons';
import { ApiError, claimGameReward, fetchStatus } from '@/lib/api/client';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { GAMES, gameById, type GameId } from '@/lib/arcade/games';
import { formatNim } from '@/lib/nimiq/units';
import { useMiniApp } from '@/state/mini-app-provider';
import { useRewardBalance } from '@/state/use-reward-balance';
import { useProgress } from '@/state/use-progress';

/**
 * The arcade.
 *
 * A finished round is recorded locally either way — that is what personal
 * bests and the streak are made of. Whether it is also real, withdrawable NIM
 * depends on whether this deployment has a store to credit it to: when it
 * does, claiming a round asks Nimiq Pay to sign, same as any other write, and
 * the server (not the score reported here) decides how much that is worth.
 * When it does not, the screen says so rather than implying money moved.
 */
export default function ArcadePage() {
  const { nimiq } = useMiniApp();
  const { progress, record } = useProgress();
  const { balance: earned } = useRewardBalance();
  const [active, setActive] = useState<GameId | null>(null);
  const [result, setResult] = useState<
    | { score: number; coins: number; hazards: number; luna: number; record: boolean; at: number }
    | null
  >(null);

  const [rewardsReady, setRewardsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchStatus().then((status) => {
      if (!cancelled) setRewardsReady(status.store);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function finish(id: GameId) {
    return (score: number, coins = 0, hazards = 0) => {
      const outcome = record(id, score, coins, hazards);
      setResult({ score, coins, hazards, luna: outcome.gained, record: outcome.record, at: Date.now() });
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
          {active === 'invasion' && <InvasionGame key="invasion" onFinish={finish('invasion')} />}
          {active === 'rush' && <RushGame key="rush" onFinish={finish('rush')} />}
          {active === 'pitch' && <PitchGame key="pitch" onFinish={finish('pitch')} />}
          {active === 'overheat' && <OverheatGame key="overheat" onFinish={finish('overheat')} />}
          {active === 'alley' && <AlleyGame key="alley" onFinish={finish('alley')} />}
        </div>

        {result && (
          <ResultBar
            key={result.at}
            game={active}
            result={result}
            address={nimiq.address}
            canClaim={rewardsReady}
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
              {earned === null ? '—' : formatNim(earned, { maximumFractionDigits: 2 })}
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
        {rewardsReady
          ? 'Every finished round is banked to your withdrawable balance automatically. Coins are worth 0.2 NIM each, hazards cost you 0.5, and your score itself earns a trickle. Capped at 200 NIM a day per player.'
          : 'Rewards are recorded on this device and are not yet payable. TeTe can only ask your wallet to send funds, never send funds to you, so paying these out needs a server that is not configured on this deployment.'}
      </PhaseNote>
    </div>
  );
}

type ClaimState =
  | { status: 'claiming' }
  | { status: 'done'; credited: number }
  | { status: 'error'; message: string };

/** Result slides in under the board so the game stays on screen behind it. */
function ResultBar({
  game,
  result,
  address,
  canClaim,
  onDismiss,
  onExit,
}: {
  game: GameId;
  result: { score: number; coins: number; hazards: number; luna: number; record: boolean };
  address: string | null;
  canClaim: boolean;
  onDismiss: () => void;
  onExit: () => void;
}) {
  const meta = gameById(game);
  const showClaim = Boolean(canClaim && address);
  const [claim, setClaim] = useState<ClaimState>({ status: 'claiming' });

  // Credited the moment the round ends — no button, because rewards should
  // not need chasing. Safe to do on mount precisely because this call is not
  // signed: nothing here raises a wallet dialog.
  useEffect(() => {
    if (!showClaim || !address) return;
    let cancelled = false;
    claimGameReward(address, game, result.score, result.coins, result.hazards)
      .then(({ credited }) => {
        if (!cancelled) setClaim({ status: 'done', credited });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setClaim({
          status: 'error',
          message: cause instanceof ApiError ? cause.message : 'Could not bank that round.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [showClaim, address, game, result.score, result.coins, result.hazards]);

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
        <div className="shrink-0 text-right">
          {(() => {
            const net = result.coins - result.hazards;
            if (net === 0) return null;
            return (
              <p
                className={cn(
                  'text-[0.75rem] font-bold tabular',
                  net > 0 ? 'text-accent' : 'text-negative',
                )}
              >
                {net > 0 ? '+' : ''}
                {net} coin{Math.abs(net) === 1 ? '' : 's'}
              </p>
            );
          })()}
          <p className="text-[1rem] font-black text-accent tabular">
            {showClaim && claim.status === 'done'
              ? `+${formatNim(claim.credited, { maximumFractionDigits: 3 })} NIM`
              : `+${formatNim(result.luna, { maximumFractionDigits: 3 })} NIM`}
          </p>
        </div>
      </div>

      {showClaim && claim.status === 'claiming' && (
        <p className="mt-3 text-[0.75rem] font-semibold text-on-contrast/55">Banking your round…</p>
      )}
      {showClaim && claim.status === 'done' && (
        <p className="mt-3 text-[0.75rem] font-semibold text-accent">
          Added to your withdrawable balance.
        </p>
      )}
      {showClaim && claim.status === 'error' && (
        <p role="alert" className="mt-3 text-[0.75rem] font-semibold text-negative">
          {claim.message}
        </p>
      )}
      {!showClaim && (
        <p className="mt-3 text-[0.75rem] leading-relaxed text-on-contrast/55">
          {address
            ? 'Recorded on this device only — rewards are not configured on this deployment.'
            : 'Recorded on this device only — connect your wallet to earn it for real.'}
        </p>
      )}

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
