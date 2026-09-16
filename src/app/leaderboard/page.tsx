'use client';

import { useEffect, useState } from 'react';

import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { PlayerFace } from '@/components/ui/PlayerFace';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { CrownIcon } from '@/components/shell/icons';
import { fetchLeaderboard, type LeaderboardEntry, type LeaderboardSource } from '@/lib/api/client';
import { shortenAddress } from '@/lib/nimiq/address';
import { formatNim } from '@/lib/nimiq/units';

type Period = 'daily' | 'weekly';

/**
 * Rankings, by real NIM earned.
 *
 * Every way TeTe pays a player counts the same: a settled challenge, an
 * arcade round, a daily check-in. Each row shows the split, because "40 NIM"
 * from winning matches and "40 NIM" from grinding the arcade are the same
 * number and not the same week, and the board is more interesting when you
 * can tell which is which.
 *
 * Daily resets every UTC day and is bragging rights only; the weekly top 3
 * are paid automatically — 100, 50 and 30 NIM, straight to their wallets —
 * the moment the week ends. See lib/server/leaderboard.ts for how and when.
 */

/** How each source is labelled and tinted in a row's split. */
const SOURCES: { id: LeaderboardSource; label: string; tone: string }[] = [
  { id: 'challenge', label: 'Challenges', tone: 'bg-accent' },
  { id: 'arcade', label: 'Arcade', tone: 'bg-positive' },
  { id: 'streak', label: 'Check-ins', tone: 'bg-gold' },
];

/**
 * An entry's split, with the gap filled in — mirrors `breakdown()` on the
 * server. A row stored before the board counted more than challenges has a
 * total and no split, and that total was challenge winnings by definition.
 */
function splitOf(entry: LeaderboardEntry): Record<LeaderboardSource, number> {
  if (!entry.by) return { challenge: entry.luna, arcade: 0, streak: 0 };
  return {
    challenge: entry.by.challenge ?? 0,
    arcade: entry.by.arcade ?? 0,
    streak: entry.by.streak ?? 0,
  };
}

/** A thin stacked bar showing where a player's total came from. */
function SourceBar({ entry }: { entry: LeaderboardEntry }) {
  const split = splitOf(entry);
  const total = SOURCES.reduce((sum, source) => sum + split[source.id], 0);
  if (total <= 0) return null;
  return (
    <div className="mt-1 flex h-1 w-full overflow-hidden rounded-full bg-panel-2">
      {SOURCES.map((source) =>
        split[source.id] > 0 ? (
          <span
            key={source.id}
            className={source.tone}
            style={{ width: `${(split[source.id] / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}
export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>('weekly');
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    fetchLeaderboard(period)
      .then((next) => {
        if (!cancelled) setEntries(next);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const top3 = entries?.slice(0, 3) ?? [];
  const rest = entries?.slice(3) ?? [];

  return (
    <div className="space-y-5 pt-2">
      <header>
        <Chip tone="gold" dot>
          Season 01
        </Chip>
        <h1 className="display mt-3 text-[2.25rem]">Rankings</h1>
        <p className="mt-2 max-w-[20rem] text-[0.875rem] leading-relaxed text-muted">
          Ranked by real NIM earned. Challenges, arcade rounds and daily check-ins all count
          toward both boards at once. Claim a username to appear — earning works either way.
        </p>
      </header>

      <SlidingTabs<Period>
        value={period}
        onChange={setPeriod}
        options={[
          { id: 'daily', label: 'Today' },
          { id: 'weekly', label: 'This week' },
        ]}
      />

      {entries === null ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-panel-2 animate-[var(--animate-shimmer)]" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Sticker tone="panel">
          <p className="text-[0.875rem] font-bold">
            {period === 'daily' ? 'Nobody has scored yet today' : 'Nobody has scored yet this week'}
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
            Win a challenge, play a round in the arcade or check in — any of them puts you on
            the board, once you have claimed a username.
          </p>
        </Sticker>
      ) : (
        <>
          <Podium entries={top3} currency="NIM" />
          {rest.length > 0 && (
            <ul className="divide-y divide-line border-y border-line">
              {rest.map((entry, i) => (
                <li key={entry.address} className="flex items-center gap-3.5 py-3">
                  <span className="w-5 shrink-0 text-center text-[0.8125rem] font-black text-faint tabular">
                    {i + 4}
                  </span>
                  <PlayerFace address={entry.address} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-bold">
                      {entry.username ? `@${entry.username}` : shortenAddress(entry.address)}
                    </span>
                    <SourceBar entry={entry} />
                  </span>
                  <span className="shrink-0 text-[0.875rem] font-black tabular text-accent-text">
                    {formatNim(entry.luna, { maximumFractionDigits: 2 })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {entries !== null && entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {SOURCES.map((source) => (
            <span key={source.id} className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-muted">
              <span className={`size-2 rounded-full ${source.tone}`} />
              {source.label}
            </span>
          ))}
        </div>
      )}

      <PhaseNote>
        {period === 'weekly'
          ? 'The top 3 here get paid automatically when the week ends: 100 NIM for first, 50 for second, 30 for third, sent straight to their wallets.'
          : "Today's board is bragging rights only — the automatic prize is on the weekly board."}
      </PhaseNote>

      <PhaseNote>
        Only players with a username are ranked. Anyone can make a wallet address, so the board
        would otherwise rank whoever can make the most of them. Your earnings are never affected
        — an unnamed player still gets every NIM they earn and can withdraw it as normal.
      </PhaseNote>

      <ButtonLink href="/profile" size="lg">
        Claim your username
      </ButtonLink>

      <ButtonLink href="/create" variant="outline" size="lg">
        Climb the board
      </ButtonLink>
    </div>
  );
}

function Podium({ entries }: { entries: LeaderboardEntry[]; currency: 'NIM' }) {
  // Centre-first order: 2nd, 1st, 3rd — the classic podium layout — built
  // from whatever real entries exist, which may be fewer than three.
  const first = entries[0];
  const second = entries[1];
  const third = entries[2];
  const slots = [
    { entry: second, place: 2, height: 'h-20', tone: 'bg-panel-2' },
    { entry: first, place: 1, height: 'h-28', tone: 'bg-accent/25' },
    { entry: third, place: 3, height: 'h-16', tone: 'bg-panel-2' },
  ];

  return (
    <Sticker tone="panel">
      <div className="flex items-end justify-center gap-2.5">
        {slots.map(({ entry, place, height, tone }) => (
          <div key={place} className="flex flex-1 flex-col items-center">
            {entry ? (
              <>
                {place === 1 && <CrownIcon className="mb-1 size-5 text-gold" />}
                <PlayerFace address={entry.address} size={40} className={place === 1 ? 'border-2 border-gold' : 'border'} />
                <p className="mt-1.5 max-w-full truncate text-[0.75rem] font-bold">
                  {entry.username ? `@${entry.username}` : shortenAddress(entry.address)}
                </p>
                <p className="text-[0.6875rem] font-black tabular text-accent-text">
                  {formatNim(entry.luna, { maximumFractionDigits: 2 })}
                </p>
                {/* The podium is exactly where the split matters most: a week
                    topped by arcade grinding and one topped by winning
                    matches are the same number and a different story. */}
                <span className="mt-1 w-full max-w-[4.5rem]">
                  <SourceBar entry={entry} />
                </span>
              </>
            ) : (
              <span
                aria-hidden
                className="mb-2 flex size-10 items-center justify-center rounded-full border border-dashed border-line text-[0.875rem] text-faint"
              >
                ?
              </span>
            )}
            <div className={`mt-2 flex w-full items-start justify-center rounded-t-xl pt-2 ${height} ${tone}`}>
              <span className="text-[1rem] font-black text-faint tabular">{place}</span>
            </div>
          </div>
        ))}
      </div>
    </Sticker>
  );
}
