'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FormatArt } from '@/components/challenges/FormatArt';
import { ChevronLeftIcon, CheckIcon, CrownIcon } from '@/components/shell/icons';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { PlayerFace } from '@/components/ui/PlayerFace';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { ConnectPanel } from '@/components/wallet/ConnectPanel';
import { ApiError, fetchBracket, joinBracket } from '@/lib/api/client';
import {
  matchesInRound,
  roundCount,
  BRACKET_STATE_LABEL,
  type Bracket,
  type BracketEntrant,
  type BracketMatch,
} from '@/lib/bracket/types';
import { formatById } from '@/lib/challenges/types';
import { copyText } from '@/lib/clipboard';
import { compactAddress, shortenAddress } from '@/lib/nimiq/address';
import { formatNim } from '@/lib/nimiq/units';
import { useMiniApp } from '@/state/mini-app-provider';

const POLL_MS = 6_000;

export default function BracketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { nimiq } = useMiniApp();

  const [bracket, setBracket] = useState<Bracket | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBracket(await fetchBracket(id));
    } catch {
      setBracket(null);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (bracket === undefined) {
    return <div className="pt-10 text-center text-[0.875rem] text-faint">Loading…</div>;
  }

  if (bracket === null) {
    return (
      <div className="pt-8">
        <Header onBack={() => router.push('/brackets')} />
        <h1 className="display mt-4 text-[1.75rem]">Tournament not found</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          It may not exist, or the link is wrong.
        </p>
      </div>
    );
  }

  const address = nimiq.address ? compactAddress(nimiq.address) : null;
  const iAmIn = address ? bracket.entrants.some((e) => compactAddress(e.address) === address) : false;
  const format = formatById(bracket.format);
  const title = bracket.title?.trim() || `${format.name} tournament`;
  const champion = bracket.championSlot !== undefined ? bracket.entrants[bracket.championSlot] : undefined;

  async function join() {
    if (!nimiq.address) return;
    setBusy(true);
    setError(null);
    try {
      setBracket(await joinBracket(nimiq.address, id));
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Could not join this tournament.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-2">
      <Header onBack={() => router.push('/brackets')} />

      <div className="mt-4 overflow-hidden rounded-3xl bg-contrast">
        <FormatArt id={bracket.format} rounded="rounded-none" className="h-32 w-full" />
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <Chip tone={bracket.state === 'complete' ? 'positive' : bracket.state === 'live' ? 'accent' : 'neutral'}>
              {BRACKET_STATE_LABEL[bracket.state]}
            </Chip>
            <span className="text-[0.75rem] font-semibold text-on-contrast/50">
              {bracket.entrants.length}/{bracket.size} players
            </span>
          </div>
          <h1 className="display mt-3 text-[1.75rem] text-on-contrast">{title}</h1>

          <div className="mt-5 border-t border-on-contrast/15 pt-4">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-on-contrast/50">
              Stake per match
            </p>
            <p className="mt-1 text-[2rem] font-black leading-none tracking-[-0.035em] tabular text-on-contrast">
              {bracket.currency === 'NIM' ? formatNim(bracket.stake) : (bracket.stake / 100).toFixed(2)}
              <span className="ml-2 text-[0.9375rem] text-on-contrast/55">{bracket.currency}</span>
            </p>
          </div>
        </div>
      </div>

      {champion && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-accent p-4 text-on-accent animate-[var(--animate-pop)]">
          <CrownIcon className="size-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-on-accent/70">Champion</p>
            <p className="truncate text-[1.0625rem] font-black tracking-tight">
              {champion.username ? `@${champion.username}` : shortenAddress(champion.address)}
            </p>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-[0.8125rem] font-semibold text-negative">
          {error}
        </p>
      )}

      <div className="mt-5">
        {!nimiq.address ? (
          <ConnectPanel />
        ) : bracket.state === 'open' && !iAmIn ? (
          <Button onClick={join} loading={busy} size="lg">
            Join tournament
          </Button>
        ) : bracket.state === 'open' && iAmIn ? (
          <ShareCard id={bracket.id} entrants={bracket.entrants.length} size={bracket.size} />
        ) : null}
      </div>

      <div className="mt-6 space-y-5">
        <Eyebrow className="text-faint">Players</Eyebrow>
        <EntrantList entrants={bracket.entrants} size={bracket.size} />
      </div>

      {bracket.matches.length > 0 && (
        <div className="mt-6 space-y-5">
          {Array.from({ length: roundCount(bracket.size) }, (_, round) => (
            <RoundSection key={round} bracket={bracket} round={round} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to tournaments"
        className="-ml-2 flex size-10 items-center justify-center rounded-full text-muted transition-colors active:text-text"
      >
        <ChevronLeftIcon className="size-5" />
      </button>
      <span className="text-[0.75rem] font-bold uppercase tracking-[0.1em] text-faint">Tournament</span>
    </header>
  );
}

function EntrantList({ entrants, size }: { entrants: BracketEntrant[]; size: number }) {
  const empties = Array.from({ length: Math.max(0, size - entrants.length) });
  return (
    <ul className="-mx-1 flex flex-wrap gap-2 px-1">
      {entrants.map((entrant) => (
        <li
          key={entrant.address}
          className="flex items-center gap-2 rounded-full bg-panel-2 py-1.5 pl-1.5 pr-3.5"
        >
          <PlayerFace address={entrant.address} size={26} />
          <span className="text-[0.8125rem] font-bold">
            {entrant.username ? `@${entrant.username}` : shortenAddress(entrant.address)}
          </span>
        </li>
      ))}
      {empties.map((_, i) => (
        <li
          key={`empty-${i}`}
          className="flex items-center gap-2 rounded-full border border-dashed border-line py-1.5 pl-1.5 pr-3.5 text-faint"
        >
          <span className="size-[26px] shrink-0 rounded-full bg-panel-2" />
          <span className="text-[0.8125rem] font-bold">Open slot</span>
        </li>
      ))}
    </ul>
  );
}

function RoundSection({ bracket, round }: { bracket: Bracket; round: number }) {
  const matches = matchesInRound(bracket, round);
  if (matches.length === 0) return null;

  const total = roundCount(bracket.size);
  const label = round === total - 1 ? 'Final' : round === total - 2 ? 'Semifinals' : `Round ${round + 1}`;

  return (
    <div>
      <Eyebrow className="mb-2 text-faint">{label}</Eyebrow>
      <ul className="space-y-2.5">
        {matches.map((match) => (
          <li key={match.challengeId}>
            <BracketMatchCard bracket={bracket} match={match} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BracketMatchCard({ bracket, match }: { bracket: Bracket; match: BracketMatch }) {
  const a = bracket.entrants[match.slotA];
  const b = bracket.entrants[match.slotB];
  const aWon = match.winnerSlot === match.slotA;
  const bWon = match.winnerSlot === match.slotB;

  return (
    <Link
      href={`/challenges/${match.challengeId}`}
      className="flex items-center justify-between gap-3 rounded-2xl bg-panel-2 px-4 py-3.5 transition-transform duration-100 active:scale-[0.98]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <PlayerFace address={a?.address ?? null} size={26} className={aWon ? 'border-2 border-accent' : 'border'} />
        <span className={`truncate text-[0.8125rem] font-bold ${bWon ? 'text-faint line-through' : ''}`}>
          {a?.username ? `@${a.username}` : a ? shortenAddress(a.address) : 'TBD'}
        </span>
      </div>
      <span className="shrink-0 text-[0.625rem] font-bold text-faint">vs</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
        <span className={`truncate text-[0.8125rem] font-bold ${aWon ? 'text-faint line-through' : ''}`}>
          {b?.username ? `@${b.username}` : b ? shortenAddress(b.address) : 'TBD'}
        </span>
        <PlayerFace address={b?.address ?? null} size={26} className={bWon ? 'border-2 border-accent' : 'border'} />
      </div>
    </Link>
  );
}

function ShareCard({ id, entrants, size }: { id: string; entrants: number; size: number }) {
  const [copied, setCopied] = useState(false);
  const url = useRef<string>('');
  useEffect(() => {
    url.current = `${window.location.origin}/brackets/${id}`;
  }, [id]);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TeTe tournament', url: url.current });
        return;
      } catch {
        /* Dismissed — fall through to copying. */
      }
    }
    setCopied(await copyText(url.current));
  }

  return (
    <Sticker tone="panel">
      <p className="text-[0.875rem] font-bold">
        {entrants}/{size} joined — waiting for the field to fill
      </p>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
        The bracket seeds randomly and starts the moment the last player joins.
      </p>
      <Button className="mt-4" onClick={share}>
        {copied ? (
          <>
            <CheckIcon className="size-4" strokeWidth={3} /> Link copied
          </>
        ) : (
          'Share tournament link'
        )}
      </Button>
      <PhaseNote className="mt-3">
        Every match is a normal challenge: fund your stake, play it, report the result.
      </PhaseNote>
    </Sticker>
  );
}
