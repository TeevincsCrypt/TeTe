'use client';

import Link from 'next/link';

import { DailyCheckIn } from '@/components/arcade/DailyCheckIn';
import { OpenInNimiqPay } from '@/components/shell/OpenInNimiqPay';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Marquee } from '@/components/ui/Marquee';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { StatTile } from '@/components/ui/StatTile';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { Sunburst } from '@/components/ui/Sunburst';
import { BalanceRail } from '@/components/wallet/BalanceRail';
import { ConnectPanel } from '@/components/wallet/ConnectPanel';
import { CHALLENGE_FORMATS } from '@/lib/challenges/types';
import { defaultHandle } from '@/lib/profile/local-profile';
import { useMiniApp } from '@/state/mini-app-provider';
import { useDrafts } from '@/state/use-drafts';
import { useProgress } from '@/state/use-progress';
import { useLocalProfile } from '@/state/use-local-profile';

const TICKER = ['Skill only', 'No luck', 'NIM · USDT', 'Winner takes all', 'Built on Nimiq'] as const;

export default function HomePage() {
  const { nimiq, host } = useMiniApp();
  const { displayName } = useLocalProfile();
  const { drafts } = useDrafts();
  const { progress } = useProgress();
  const connected = nimiq.address !== null;
  const handle = displayName ?? defaultHandle(nimiq.address);

  return (
    <div className="space-y-6 pt-2">
      <Hero connected={connected} handle={handle} />

      {connected ? <BalanceRail /> : host === 'unavailable' ? <OpenInNimiqPay /> : <ConnectPanel />}

      <DailyCheckIn />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <Eyebrow className="text-faint">Your record</Eyebrow>
          <Chip tone="neutral">Season 01</Chip>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Wins" value={0} accent="accent" icon="🏆" />
          <StatTile label="Win rate" value="—" accent="plain" icon="🎯" />
          <StatTile label="Streak" value={progress.streak} accent="flame" icon="🔥" />
          <StatTile label="XP" value={progress.xp.toLocaleString()} accent="gold" icon="⭐" />
        </div>
        <PhaseNote className="mt-3">
          Streak and XP are live and yours. Wins and win rate stay at zero until
          challenges go live — real counters, not a preview.
        </PhaseNote>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/arcade"
          className="rounded-[var(--radius-sticker)] border-2 border-ink bg-accent p-4 shadow-[var(--shadow-sticker)] transition-transform duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <span aria-hidden className="text-[1.75rem] leading-none">🕹</span>
          <span className="display mt-2.5 block text-[1.125rem] text-on-accent">Arcade</span>
          <span className="mt-0.5 block text-[0.6875rem] text-on-accent/70">Play. Earn XP.</span>
        </Link>
        <Link
          href="/leaderboard"
          className="rounded-[var(--radius-sticker)] border-2 border-ink bg-contrast p-4 shadow-[var(--shadow-sticker)] transition-transform duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <span aria-hidden className="text-[1.75rem] leading-none">👑</span>
          <span className="display mt-2.5 block text-[1.125rem] text-on-contrast">Ranks</span>
          <span className="mt-0.5 block text-[0.6875rem] text-on-contrast/60">Season 01</span>
        </Link>
      </section>

      <section>
        <Eyebrow className="mb-3 text-faint">Pick your arena</Eyebrow>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
          {CHALLENGE_FORMATS.map((format) => (
            <Link
              key={format.id}
              href={`/create?format=${format.id}`}
              className="group w-[9.75rem] shrink-0 rounded-[var(--radius-sticker)] border-2 border-line bg-panel p-4 transition-transform duration-150 active:scale-[0.96]"
            >
              <span aria-hidden className="text-[1.75rem] leading-none">
                {format.icon}
              </span>
              <p className="display mt-3 text-[1rem]">{format.name}</p>
              <p className="mt-1 text-[0.6875rem] leading-snug text-faint">{format.tagline}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <Eyebrow className="text-faint">Live matches</Eyebrow>
          <Link href="/challenges" className="text-[0.75rem] font-bold text-accent-text">
            See all
          </Link>
        </div>

        <Sticker tone="panel" className="px-0 py-0">
          <EmptyState
            glyph="⚔️"
            title="No matches yet"
            body={
              drafts.length > 0
                ? `You have ${drafts.length} draft${drafts.length === 1 ? '' : 's'} waiting. Funding and invites arrive with escrow.`
                : 'Set up your first challenge and it will show up here the moment escrow goes live.'
            }
            action={<ButtonLink href="/create">Create challenge</ButtonLink>}
          />
        </Sticker>
      </section>

      <div className="-mx-4 border-y-2 border-line bg-panel py-2.5 text-text">
        <Marquee items={TICKER} />
      </div>
    </div>
  );
}

function Hero({ connected, handle }: { connected: boolean; handle: string }) {
  return (
    <section className="relative overflow-hidden rounded-[var(--radius-sticker)] border-2 border-ink bg-panel px-5 pb-6 pt-7">
      <Sunburst className="-right-16 -top-24 size-64 text-accent/[0.13]" />

      <div className="relative">
        <div className="flex items-center gap-2">
          <Chip tone="accent" dot pulse>
            {connected ? `Welcome back, ${handle}` : 'Ready when you are'}
          </Chip>
        </div>

        <h1 className="display mt-4 text-[2.75rem]">
          Challenge.
          <br />
          Compete.
          <br />
          <span className="text-accent-text">Win.</span>
        </h1>

        <p className="mt-3 max-w-[19rem] text-[0.9375rem] leading-relaxed text-muted">
          Put up a stake, beat your opponent, take the pot. Decided by skill — never by chance.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <ButtonLink href="/create" size="lg" className="flex-1">
            + Create challenge
          </ButtonLink>
        </div>
      </div>

      {/* A little personality, borrowed from arcade cabinet art. */}
      <span
        aria-hidden
        className="absolute right-4 top-5 rotate-6 rounded-2xl border-2 border-ink bg-contrast px-2.5 py-1 text-[0.625rem] font-black uppercase tracking-wider text-on-contrast shadow-[var(--shadow-sticker-sm)] animate-[var(--animate-bob)]"
      >
        1v1?
      </span>
    </section>
  );
}
