'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { DailyCheckIn } from '@/components/arcade/DailyCheckIn';
import { GameGlyph } from '@/components/arcade/GameGlyph';
import { FormatArt } from '@/components/challenges/FormatArt';
import { OpenInNimiqPay } from '@/components/shell/OpenInNimiqPay';
import {
  ChevronRightIcon,
  CrownIcon,
  FlameIcon,
  StarIcon,
  SwordsIcon,
  TrophyIcon,
  XIcon,
} from '@/components/shell/icons';
import { Marquee } from '@/components/ui/Marquee';
import { PlayerFace } from '@/components/ui/PlayerFace';
import { BalanceRail } from '@/components/wallet/BalanceRail';
import { ConnectPanel } from '@/components/wallet/ConnectPanel';
import { GAMES } from '@/lib/arcade/games';
import { fetchRecentSettled } from '@/lib/api/client';
import { CHALLENGE_FORMATS, formatById } from '@/lib/challenges/types';
import { pot, type Challenge } from '@/lib/escrow/types';
import { shortenAddress } from '@/lib/nimiq/address';
import { formatNim } from '@/lib/nimiq/units';
import { defaultHandle } from '@/lib/profile/local-profile';
import { rememberReferredBy } from '@/lib/profile/referral';
import { useMiniApp } from '@/state/mini-app-provider';
import { useDrafts } from '@/state/use-drafts';
import { useLocalProfile } from '@/state/use-local-profile';
import { useRecord } from '@/state/use-record';
import { useRewardBalance } from '@/state/use-reward-balance';
import { useProgress } from '@/state/use-progress';

const TICKER = ['Skill only', 'No luck', 'NIM and USDT', 'Winner takes all', 'Built on Nimiq'] as const;

export default function HomePage() {
  const { nimiq, host } = useMiniApp();
  const { displayName } = useLocalProfile();
  const { drafts } = useDrafts();
  const { progress } = useProgress();
  const { balance: earned } = useRewardBalance();
  const record = useRecord(nimiq.address);
  const connected = nimiq.address !== null;
  const handle = displayName ?? defaultHandle(nimiq.address);

  // A one-time, unreactive read — this only ever needs to catch the code a
  // fresh `?ref=` link arrived with, never to follow later URL changes.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) rememberReferredBy(ref);
  }, []);

  return (
    <div className="pt-1">
      {/* Editorial masthead. No border, no shadow — the type carries it. */}
      <header className="pb-6">
        <p className="eyebrow text-faint">
          {connected ? `Back again, ${handle}` : 'Peer to peer, skill only'}
        </p>
        <h1 className="display mt-3 text-[3rem] leading-[0.86]">
          Challenge.
          <br />
          Compete.
          <br />
          <span className="text-accent-text">Win.</span>
        </h1>
        <p className="mt-4 max-w-[20rem] text-[0.9375rem] leading-relaxed text-muted">
          Put up a stake, beat your opponent, take the pot. Decided by skill — never by chance.
        </p>

        <Link
          href="/create"
          className="mt-6 inline-flex min-h-13 w-full items-center justify-between rounded-full bg-contrast pl-6 pr-2 text-on-contrast transition-transform duration-100 active:scale-[0.985]"
        >
          <span className="text-[0.9375rem] font-bold">Create a challenge</span>
          <span className="flex size-10 items-center justify-center rounded-full bg-accent text-on-accent">
            <SwordsIcon className="size-4.5" />
          </span>
        </Link>
      </header>

      {connected ? <BalanceRail /> : host === 'unavailable' ? <OpenInNimiqPay /> : <ConnectPanel />}

      <div className="mt-6">
        <DailyCheckIn />
      </div>

      {/* Stats as a figure row divided by hairlines, not four bordered boxes. */}
      <section className="mt-8 border-y border-line">
        <div className="grid grid-cols-4 divide-x divide-line">
          <Figure icon={<TrophyIcon className="size-3.5" />} label="Wins" value={record ? String(record.won) : '—'} />
          <Figure icon={<FlameIcon className="size-3.5" />} label="Streak" value={String(progress.streak)} />
          <Figure icon={<StarIcon className="size-3.5" />} label="Earned" value={earned === null ? '—' : formatNim(earned, { maximumFractionDigits: 2 })} />
          <Figure icon={<CrownIcon className="size-3.5" />} label="Rank" value="—" />
        </div>
      </section>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
        <Link href="/leaderboard" className="flex items-center gap-1.5 py-1 text-[0.75rem] font-bold text-accent-text active:opacity-60">
          Season 01 standings
          <ChevronRightIcon className="size-3.5" />
        </Link>
        <Link href="/wallet" className="flex items-center gap-1.5 py-1 text-[0.75rem] font-bold text-accent-text active:opacity-60">
          Wallet and earnings
          <ChevronRightIcon className="size-3.5" />
        </Link>
      </div>
      <p className="mt-1 text-[0.6875rem] leading-snug text-faint">
        Streak, earnings and wins are yours and live. Rank stays empty until ranking ships.
      </p>

      <Section title="Arcade" href="/arcade" action="All games">
        <ul className="divide-y divide-line">
          {GAMES.map((game) => (
            <li key={game.id}>
              <Link href="/arcade" className="flex items-center gap-3.5 py-3.5 active:opacity-60">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-contrast text-accent">
                  <GameGlyph id={game.id} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-bold tracking-tight">{game.name}</span>
                  <span className="block truncate text-[0.75rem] text-faint">{game.tagline}</span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Arenas" href="/create" action="Set one up">
        <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar">
          {CHALLENGE_FORMATS.map((format) => (
            <Link
              key={format.id}
              href={`/create?format=${format.id}`}
              className="w-[9.5rem] shrink-0 overflow-hidden rounded-2xl bg-panel-2 transition-transform duration-100 active:scale-[0.97]"
            >
              <FormatArt id={format.id} rounded="rounded-none" className="h-20 w-full" />
              <span className="block px-3.5 pb-3.5 pt-3">
                <span className="block text-[0.9375rem] font-black tracking-tight">{format.name}</span>
                <span className="mt-0.5 block text-[0.6875rem] leading-snug text-faint">
                  {format.tagline}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Link
        href="/brackets"
        className="mt-8 flex items-center gap-3.5 rounded-2xl bg-contrast p-4 transition-transform duration-100 active:scale-[0.98]"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
          <TrophyIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-black tracking-tight text-on-contrast">Tournaments</p>
          <p className="mt-0.5 truncate text-[0.75rem] text-on-contrast/60">
            4 or 8 players. Single elimination. Winner takes all.
          </p>
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-on-contrast/50" />
      </Link>

      <Section title="Recent wins" href="/challenges" action="See all">
        <RecentWins draftCount={drafts.length} />
      </Section>

      <div className="-mx-4 mt-9 border-y border-line py-2.5">
        <Marquee items={TICKER} />
      </div>

      <footer className="mt-6 pb-2 text-center">
        <a
          href="https://x.com/teteonnimiq"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[0.75rem] font-bold text-faint active:opacity-60"
        >
          Follow on <XIcon className="size-3.5" />
        </a>
      </footer>
    </div>
  );
}

function Figure({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="px-1 py-3.5 text-center">
      <span className="flex items-center justify-center gap-1 text-faint">
        {icon}
        <span className="text-[0.5625rem] font-bold uppercase tracking-[0.1em]">{label}</span>
      </span>
      <p className="mt-1.5 text-[1.25rem] font-black leading-none tracking-[-0.03em] tabular">
        {value}
      </p>
    </div>
  );
}

function Section({
  title,
  href,
  action,
  children,
}: {
  title: string;
  href: string;
  action: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-[1.125rem] font-black tracking-tight">{title}</h2>
        <Link href={href} className="text-[0.75rem] font-bold text-accent-text">
          {action}
        </Link>
      </div>
      {children}
    </section>
  );
}

/** How long ago, roughly — a full timestamp is more precision than "a win" needs. */
function timeAgo(at: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Real, recent, public — every settled challenge across the whole app, not
 * only this player's own. An empty list stays an honest empty state rather
 * than pretending activity that has not happened yet.
 */
function RecentWins({ draftCount }: { draftCount: number }) {
  const [recent, setRecent] = useState<Challenge[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRecentSettled()
      .then((challenges) => {
        if (!cancelled) setRecent(challenges);
      })
      .catch(() => {
        if (!cancelled) setRecent(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!recent || recent.length === 0) {
    return (
      <div className="rounded-2xl bg-panel-2 px-5 py-8 text-center">
        <p className="text-[0.9375rem] font-bold">Nothing settled yet</p>
        <p className="mx-auto mt-1.5 max-w-[17rem] text-[0.8125rem] leading-relaxed text-muted">
          {draftCount > 0
            ? `${draftCount} draft${draftCount === 1 ? '' : 's'} waiting. Fund one and be the first win on the board.`
            : 'Set up a challenge and every settled win shows up here, for everyone.'}
        </p>
      </div>
    );
  }

  return (
    <ul className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar">
      {recent.slice(0, 6).map((challenge) => {
        const winnerSide = challenge.winner === 'guest' ? challenge.guest : challenge.host;
        const loserSide = challenge.winner === 'guest' ? challenge.host : challenge.guest;
        if (!winnerSide) return null;
        const format = formatById(challenge.format);
        const amount =
          challenge.currency === 'NIM' ? formatNim(pot(challenge), { maximumFractionDigits: 2 }) : (pot(challenge) / 100).toFixed(2);

        return (
          <Link
            key={challenge.id}
            href={`/challenges/${challenge.id}`}
            className="w-[10.5rem] shrink-0 rounded-2xl bg-panel-2 p-3.5 transition-transform duration-100 active:scale-[0.97]"
          >
            <div className="flex items-center">
              <PlayerFace address={winnerSide.address} size={30} className="border-2 border-accent" />
              {loserSide && (
                <PlayerFace address={loserSide.address} size={30} className="-ml-2 border-2 border-line opacity-60" />
              )}
              <span className="ml-auto text-[0.625rem] font-bold text-faint">{timeAgo(challenge.updatedAt)}</span>
            </div>
            <p className="mt-2.5 truncate text-[0.8125rem] font-black tracking-tight">
              {winnerSide.username ? `@${winnerSide.username}` : shortenAddress(winnerSide.address)}
            </p>
            <p className="mt-0.5 truncate text-[0.6875rem] text-faint">Won {format.name}</p>
            <p className="mt-1.5 text-[0.9375rem] font-black tabular text-accent-text">
              +{amount}
              <span className="ml-1 text-[0.625rem] text-faint">{challenge.currency}</span>
            </p>
          </Link>
        );
      })}
    </ul>
  );
}
