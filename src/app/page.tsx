'use client';

import Link from 'next/link';

import { DailyCheckIn } from '@/components/arcade/DailyCheckIn';
import { GameGlyph } from '@/components/arcade/GameGlyph';
import { OpenInNimiqPay } from '@/components/shell/OpenInNimiqPay';
import {
  ChevronRightIcon,
  CrownIcon,
  FlameIcon,
  StarIcon,
  SwordsIcon,
  TrophyIcon,
} from '@/components/shell/icons';
import { Marquee } from '@/components/ui/Marquee';
import { BalanceRail } from '@/components/wallet/BalanceRail';
import { ConnectPanel } from '@/components/wallet/ConnectPanel';
import { GAMES } from '@/lib/arcade/games';
import { CHALLENGE_FORMATS } from '@/lib/challenges/types';
import { formatNim } from '@/lib/nimiq/units';
import { defaultHandle } from '@/lib/profile/local-profile';
import { useMiniApp } from '@/state/mini-app-provider';
import { useDrafts } from '@/state/use-drafts';
import { useLocalProfile } from '@/state/use-local-profile';
import { useEarnings } from '@/state/use-earnings';
import { useProgress } from '@/state/use-progress';

const TICKER = ['Skill only', 'No luck', 'NIM and USDT', 'Winner takes all', 'Built on Nimiq'] as const;

export default function HomePage() {
  const { nimiq, host } = useMiniApp();
  const { displayName } = useLocalProfile();
  const { drafts } = useDrafts();
  const { progress } = useProgress();
  const { totalLuna } = useEarnings();
  const connected = nimiq.address !== null;
  const handle = displayName ?? defaultHandle(nimiq.address);

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
          <Figure icon={<TrophyIcon className="size-3.5" />} label="Wins" value="0" />
          <Figure icon={<FlameIcon className="size-3.5" />} label="Streak" value={String(progress.streak)} />
          <Figure icon={<StarIcon className="size-3.5" />} label="Earned" value={formatNim(totalLuna)} />
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
        Streak and earnings are yours and live. Wins and rank stay empty until challenges ship.
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
              className="w-[8.75rem] shrink-0 rounded-2xl bg-panel-2 p-4 transition-transform duration-100 active:scale-[0.97]"
            >
              <span className="block text-[0.9375rem] font-black tracking-tight">{format.name}</span>
              <span className="mt-1 block text-[0.6875rem] leading-snug text-faint">
                {format.tagline}
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Live matches" href="/challenges" action="See all">
        <div className="rounded-2xl bg-panel-2 px-5 py-8 text-center">
          <p className="text-[0.9375rem] font-bold">Nothing live yet</p>
          <p className="mx-auto mt-1.5 max-w-[17rem] text-[0.8125rem] leading-relaxed text-muted">
            {drafts.length > 0
              ? `${drafts.length} draft${drafts.length === 1 ? '' : 's'} waiting. Funding and invites arrive with escrow.`
              : 'Set up a challenge and it appears here the moment escrow ships.'}
          </p>
        </div>
      </Section>

      <div className="-mx-4 mt-9 border-y border-line py-2.5">
        <Marquee items={TICKER} />
      </div>
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
