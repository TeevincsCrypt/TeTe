'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FormatArt } from '@/components/challenges/FormatArt';
import { TrophyIcon } from '@/components/shell/icons';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { fetchMyBrackets, fetchOpenBrackets, fetchStatus } from '@/lib/api/client';
import { BRACKET_STATE_LABEL, type Bracket, type BracketState } from '@/lib/bracket/types';
import { formatById } from '@/lib/challenges/types';
import { formatNim } from '@/lib/nimiq/units';
import { useMiniApp } from '@/state/mini-app-provider';

type Tab = 'open' | 'mine';

const STATE_TONE: Record<BracketState, 'neutral' | 'accent' | 'positive'> = {
  open: 'neutral',
  live: 'accent',
  complete: 'positive',
};

/**
 * Tournaments: a bracket of 4 or 8 players, seeded randomly once full, every
 * round settled as an ordinary challenge. See lib/bracket/types.ts.
 */
export default function BracketsPage() {
  const { nimiq } = useMiniApp();
  const [tab, setTab] = useState<Tab>('open');
  const [backend, setBackend] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [open, setOpen] = useState<Bracket[]>([]);
  const [mine, setMine] = useState<Bracket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const status = await fetchStatus();
      setBackend(status.store ? 'ready' : 'unavailable');
      if (!status.store) return;
      const [openList, myList] = await Promise.all([
        fetchOpenBrackets(),
        nimiq.address ? fetchMyBrackets(nimiq.address) : Promise.resolve([]),
      ]);
      const mineIds = new Set(myList.map((b) => b.id));
      setOpen(openList.filter((b) => !mineIds.has(b.id)));
      setMine(myList);
    } catch {
      setBackend('unavailable');
    } finally {
      setLoaded(true);
      inFlight.current = false;
    }
  }, [nimiq.address]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 6000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="space-y-5 pt-2">
      <header>
        <Eyebrow className="text-faint">Skill only, bracket style</Eyebrow>
        <h1 className="display mt-1 text-[2rem]">Tournaments</h1>
      </header>

      <ButtonLink href="/brackets/create" size="lg">
        Start a tournament
      </ButtonLink>

      <SlidingTabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { id: 'open', label: 'Open', count: open.length },
          { id: 'mine', label: 'Mine', count: mine.length },
        ]}
      />

      {backend === 'unavailable' && (
        <Sticker tone="panel">
          <p className="text-[0.875rem] font-bold">Escrow is not configured</p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
            This deployment has no treasury or database set up yet, so tournaments cannot be
            started.
          </p>
        </Sticker>
      )}

      {backend === 'ready' && !loaded && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-panel-2 animate-[var(--animate-shimmer)]" />
          ))}
        </div>
      )}

      {backend === 'ready' && loaded && tab === 'open' && (
        open.length === 0 ? (
          <Sticker tone="panel" className="px-0 py-0">
            <EmptyState
              glyph={<TrophyIcon className="size-7" />}
              title="No tournaments open"
              body="Start one and invite three or seven others to fill the bracket."
              action={<ButtonLink href="/brackets/create">Start a tournament</ButtonLink>}
            />
          </Sticker>
        ) : (
          <ul className="divide-y divide-line">
            {open.map((bracket) => (
              <li key={bracket.id}>
                <BracketRow bracket={bracket} />
              </li>
            ))}
          </ul>
        )
      )}

      {backend === 'ready' && loaded && tab === 'mine' && (
        !nimiq.address ? (
          <Sticker tone="panel" className="px-0 py-0">
            <EmptyState
              glyph={<TrophyIcon className="size-7" />}
              title="Connect to see your tournaments"
              body="Tournaments you have joined or started will show up here."
            />
          </Sticker>
        ) : mine.length === 0 ? (
          <Sticker tone="panel" className="px-0 py-0">
            <EmptyState
              glyph={<TrophyIcon className="size-7" />}
              title="No tournaments yet"
              body="Start one, or join one from the Open tab."
              action={<ButtonLink href="/brackets/create">Start a tournament</ButtonLink>}
            />
          </Sticker>
        ) : (
          <ul className="divide-y divide-line">
            {mine.map((bracket) => (
              <li key={bracket.id}>
                <BracketRow bracket={bracket} />
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function BracketRow({ bracket }: { bracket: Bracket }) {
  const format = formatById(bracket.format);
  return (
    <Link
      href={`/brackets/${bracket.id}`}
      className="flex items-center gap-3.5 py-3.5 active:opacity-60"
    >
      <FormatArt id={bracket.format} className="size-12 shrink-0" rounded="rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-black tracking-tight">
          {bracket.title?.trim() || `${format.name} tournament`}
        </p>
        <p className="mt-0.5 truncate text-[0.75rem] text-faint">
          {bracket.entrants.length}/{bracket.size} players
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[0.9375rem] font-black tabular">
          {bracket.currency === 'NIM'
            ? formatNim(bracket.stake * 2)
            : ((bracket.stake * 2) / 100).toFixed(2)}
          <span className="ml-1 text-[0.625rem] text-faint">{bracket.currency}</span>
        </p>
        <div className="mt-1">
          <Chip tone={STATE_TONE[bracket.state]}>{BRACKET_STATE_LABEL[bracket.state]}</Chip>
        </div>
      </div>
    </Link>
  );
}
