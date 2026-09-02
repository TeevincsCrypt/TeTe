'use client';

import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { FlameIcon, HandshakeIcon, ScalesIcon, TrophyIcon } from '@/components/shell/icons';
import { Sunburst } from '@/components/ui/Sunburst';
import { formatNim } from '@/lib/nimiq/units';
import { useRewardBalance } from '@/state/use-reward-balance';
import { useProgress } from '@/state/use-progress';

/**
 * Rankings.
 *
 * There is no leaderboard data because no TeTe match has been played. Rather
 * than fabricate a table of players, this screen shows the empty podium and
 * explains exactly how a rank will be earned — which is the honest version of
 * the same information, and gives a first player a reason to be first.
 */
const RULES = [
  { Icon: TrophyIcon, title: 'Win matches', body: 'Every settled win adds to your score.' },
  { Icon: FlameIcon, title: 'Build streaks', body: 'Consecutive wins multiply what you earn.' },
  { Icon: ScalesIcon, title: 'Stake weight', body: 'Bigger stakes against stronger opponents count for more.' },
  { Icon: HandshakeIcon, title: 'Settle clean', body: 'Confirming results promptly protects your reputation.' },
] as const;

export default function LeaderboardPage() {
  const { progress } = useProgress();
  const { balance: earned } = useRewardBalance();

  return (
    <div className="space-y-5 pt-2">
      <header className="relative overflow-hidden rounded-3xl bg-contrast px-6 pb-7 pt-6 text-on-contrast">
        <Sunburst className="-right-20 -top-20 size-56 text-gold/[0.14]" />
        <div className="relative">
          <Chip tone="gold" dot>
            Season 01
          </Chip>
          <h1 className="display mt-3 text-[2.25rem]">
            The <span className="text-gold">throne</span>
            <br />
            is empty
          </h1>
          <p className="mt-3 max-w-[18rem] text-[0.875rem] leading-relaxed text-on-contrast/65">
            Nobody has played a TeTe match yet. The first win on the board takes the crown.
          </p>
        </div>
      </header>

      <Podium />

      <section>
        <Eyebrow className="mb-3 text-faint">Your standing</Eyebrow>
        <Sticker tone="panel">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow text-faint">Earned</p>
              <p className="display mt-1 text-[2rem] tabular">{earned === null ? '—' : formatNim(earned, { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="text-right">
              <p className="eyebrow text-faint">Streak</p>
              <p className="display mt-1 text-[2rem] text-flame tabular">{progress.streak}</p>
            </div>
          </div>
          <p className="mt-4 border-t-2 border-line pt-3.5 text-[0.75rem] leading-relaxed text-muted">
            Earned in the <span className="font-bold text-accent-text">Arcade</span> and from daily
            check-ins. Real, and counted only on this device.
          </p>
        </Sticker>
      </section>

      <section>
        <Eyebrow className="mb-3 text-faint">How rank is earned</Eyebrow>
        <div className="divide-y divide-line border-y border-line">
          {RULES.map((rule) => (
            <div key={rule.title} className="flex items-center gap-3.5 py-3.5">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-panel-2 text-muted"
              >
                <rule.Icon className="size-4" />
              </span>
              <div>
                <p className="text-[0.875rem] font-black tracking-tight">{rule.title}</p>
                <p className="mt-0.5 text-[0.75rem] leading-snug text-faint">{rule.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <PhaseNote>
        Global ranking is not live. Your earnings above are recorded but local —
        comparing players needs a backend to hold the table, and match scores need
        escrow so results can be settled. Neither exists yet.
      </PhaseNote>

      <ButtonLink href="/create" size="lg">
        Claim first place
      </ButtonLink>
    </div>
  );
}

/** An empty podium — the shape of the thing, honestly unfilled. */
function Podium() {
  const places = [
    { place: 2, height: 'h-20', tone: 'bg-panel-2' },
    { place: 1, height: 'h-28', tone: 'bg-accent/25' },
    { place: 3, height: 'h-16', tone: 'bg-panel-2' },
  ];

  return (
    <Sticker tone="panel">
      <div className="flex items-end justify-center gap-2.5">
        {places.map(({ place, height, tone }) => (
          <div key={place} className="flex flex-1 flex-col items-center">
            <span
              aria-hidden
              className="mb-2 flex size-10 items-center justify-center rounded-full border border-dashed border-line text-[0.875rem] text-faint"
            >
              ?
            </span>
            <div
              className={cn(
                'flex w-full items-start justify-center rounded-t-xl pt-2',
                height,
                tone,
              )}
            >
              <span className="text-[1rem] font-black text-faint tabular">{place}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-[0.75rem] text-faint">Waiting for the first result</p>
    </Sticker>
  );
}
