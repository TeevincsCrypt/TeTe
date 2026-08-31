'use client';

import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { Sunburst } from '@/components/ui/Sunburst';

/**
 * Rankings.
 *
 * There is no leaderboard data because no TeTe match has been played. Rather
 * than fabricate a table of players, this screen shows the empty podium and
 * explains exactly how a rank will be earned — which is the honest version of
 * the same information, and gives a first player a reason to be first.
 */
const RULES = [
  { glyph: '🏆', title: 'Win matches', body: 'Every settled win adds to your score.' },
  { glyph: '🔥', title: 'Build streaks', body: 'Consecutive wins multiply what you earn.' },
  { glyph: '⚖️', title: 'Stake weight', body: 'Bigger stakes against stronger opponents count for more.' },
  { glyph: '🤝', title: 'Settle clean', body: 'Confirming results promptly protects your reputation.' },
] as const;

export default function LeaderboardPage() {
  return (
    <div className="space-y-5 pt-2">
      <header className="relative overflow-hidden rounded-[var(--radius-sticker)] border-2 border-ink bg-panel px-5 pb-6 pt-6">
        <Sunburst className="-right-20 -top-20 size-56 text-gold/[0.14]" />
        <div className="relative">
          <Chip tone="gold" dot>
            Season 01
          </Chip>
          <h1 className="display mt-3 text-[2rem]">
            The <span className="text-gold">throne</span>
            <br />
            is empty
          </h1>
          <p className="mt-2.5 max-w-[18rem] text-[0.875rem] leading-relaxed text-muted">
            Nobody has played a TeTe match yet. The first win on the board takes the crown.
          </p>
        </div>
      </header>

      <Podium />

      <section>
        <Eyebrow className="mb-3 text-faint">How rank is earned</Eyebrow>
        <div className="space-y-2.5">
          {RULES.map((rule) => (
            <div
              key={rule.title}
              className="flex items-center gap-3.5 rounded-2xl border-2 border-line bg-panel p-3.5"
            >
              <span aria-hidden className="text-[1.25rem] leading-none">
                {rule.glyph}
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
        Ranking is not live. Scores start being recorded once challenges can be
        funded and settled, so no standings exist to show.
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
    { place: 2, height: 'h-20', tone: 'bg-panel-2 border-line' },
    { place: 1, height: 'h-28', tone: 'bg-gold/15 border-gold/40' },
    { place: 3, height: 'h-16', tone: 'bg-panel-2 border-line' },
  ];

  return (
    <Sticker tone="panel">
      <div className="flex items-end justify-center gap-2.5">
        {places.map(({ place, height, tone }) => (
          <div key={place} className="flex flex-1 flex-col items-center">
            <span
              aria-hidden
              className="mb-2 flex size-11 items-center justify-center rounded-full border-2 border-dashed border-line text-[1rem] text-faint"
            >
              ?
            </span>
            <div
              className={cn(
                'flex w-full items-start justify-center rounded-t-xl border-2 pt-2',
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
