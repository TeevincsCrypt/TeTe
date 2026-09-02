'use client';

import { useEffect, useRef, useState } from 'react';

import { ChallengeRow } from '@/components/challenges/ChallengeRow';
import { MatchCard } from '@/components/challenges/MatchCard';
import { BoltIcon, FlagIcon, NoteIcon, SwordsIcon, TrashIcon } from '@/components/shell/icons';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { draftTitle, type ChallengeDraft } from '@/lib/challenges/types';
import { LIVE_STATES, TERMINAL_STATES } from '@/lib/escrow/types';
import { compactAddress, shortenAddress } from '@/lib/nimiq/address';
import { useMiniApp } from '@/state/mini-app-provider';
import { useChallenges } from '@/state/use-challenges';
import { useDrafts } from '@/state/use-drafts';

type Tab = 'board' | 'mine' | 'drafts';

/**
 * The player's challenges.
 *
 * When the backend is configured, Board and Mine show real challenges pulled
 * from the API and stay current on a short poll — there is no push channel.
 * Drafts are always available: local objects the player built, which exist
 * whether or not escrow is configured on this deployment. Once escrow is up,
 * new challenges are posted for real from Create, so drafts mostly matter as
 * a fallback for a deployment that has not set the server variables yet.
 */
export default function ChallengesPage() {
  const { nimiq } = useMiniApp();
  const { drafts, loaded: draftsLoaded, remove } = useDrafts();
  const { backend, board, mine, loaded: liveLoaded, replace } = useChallenges(nimiq.address);

  const [tab, setTab] = useState<Tab>('drafts');
  const defaultedTab = useRef(false);
  useEffect(() => {
    // Default to a live tab once we know escrow is actually configured, but
    // only the first time — never yank the tab out from under the player.
    if (!defaultedTab.current && backend === 'ready') {
      setTab('mine');
      defaultedTab.current = true;
    }
  }, [backend]);

  // Open ones belong here too: a challenge you posted and are waiting on, or one
  // aimed at you that you have not accepted yet, is exactly what "Mine" is for.
  // Excluding them meant posting a challenge made it disappear from your own
  // view until somebody else acted on it. The board never double-shows these —
  // it already filters out anything you are a party to.
  const activeMine = mine.filter((c) => LIVE_STATES.includes(c.state));
  const doneMine = mine.filter((c) => TERMINAL_STATES.includes(c.state));

  return (
    <div className="space-y-5 pt-2">
      <header>
        <Eyebrow className="text-faint">Your battles</Eyebrow>
        <h1 className="display mt-1 text-[2rem]">Challenges</h1>
      </header>

      <SlidingTabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { id: 'board', label: 'Board', count: board.length },
          { id: 'mine', label: 'Mine', count: activeMine.length },
          { id: 'drafts', label: 'Drafts', count: drafts.length },
        ]}
      />

      {tab === 'board' && (
        <BoardTab backend={backend} loaded={liveLoaded} board={board} connected={Boolean(nimiq.address)} />
      )}

      {tab === 'mine' && (
        <MineTab
          backend={backend}
          loaded={liveLoaded}
          active={activeMine}
          done={doneMine}
          myAddress={nimiq.address}
          onChanged={replace}
        />
      )}

      {tab === 'drafts' && (
        <div className="space-y-3">
          {!draftsLoaded && (
            <div className="h-28 rounded-[var(--radius-sticker)] border-2 border-line bg-panel animate-[var(--animate-shimmer)]" />
          )}

          {draftsLoaded && drafts.length === 0 && (
            <Sticker tone="panel" className="px-0 py-0">
              <EmptyState
                glyph={<NoteIcon className="size-7" />}
                title="No drafts yet"
                body={
                  backend === 'ready'
                    ? 'Drafts are for challenges saved before you post them. Create one to get started.'
                    : 'Build a challenge and it lands here until escrow is configured on this deployment.'
                }
                action={<ButtonLink href="/create">Create challenge</ButtonLink>}
              />
            </Sticker>
          )}

          {draftsLoaded && drafts.length > 0 && (
            <>
              {drafts.map((draft) => (
                <DraftRow key={draft.id} draft={draft} onDelete={() => remove(draft.id)} />
              ))}
              <PhaseNote>
                Drafts live only on this device. Nothing is funded and no opponent has been
                notified — post a real challenge from Create once you are ready.
              </PhaseNote>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BoardTab({
  backend,
  loaded,
  board,
  connected,
}: {
  backend: 'checking' | 'ready' | 'unavailable';
  loaded: boolean;
  board: import('@/lib/escrow/types').Challenge[];
  connected: boolean;
}) {
  if (backend === 'unavailable') return <EscrowUnavailable />;
  if (!loaded) return <ListSkeleton />;

  if (board.length === 0) {
    return (
      <Sticker tone="panel" className="px-0 py-0">
        <EmptyState
          glyph={<BoltIcon className="size-7" />}
          title="Nothing open right now"
          body="Open challenges anyone can accept will show up here."
          action={<ButtonLink href="/create">Post one</ButtonLink>}
        />
      </Sticker>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {board.map((challenge) => (
          <li key={challenge.id}>
            <ChallengeRow challenge={challenge} />
          </li>
        ))}
      </ul>
      {!connected && (
        <PhaseNote className="mt-3">Connect your wallet to accept one of these.</PhaseNote>
      )}
    </div>
  );
}

function MineTab({
  backend,
  loaded,
  active,
  done,
  myAddress,
  onChanged,
}: {
  backend: 'checking' | 'ready' | 'unavailable';
  loaded: boolean;
  active: import('@/lib/escrow/types').Challenge[];
  done: import('@/lib/escrow/types').Challenge[];
  myAddress: string | null;
  onChanged: (challenge: import('@/lib/escrow/types').Challenge) => void;
}) {
  if (backend === 'unavailable') return <EscrowUnavailable />;
  if (!myAddress) {
    return (
      <Sticker tone="panel" className="px-0 py-0">
        <EmptyState
          glyph={<FlagIcon className="size-7" />}
          title="Connect to see your matches"
          body="Challenges you have joined or posted will show up here."
        />
      </Sticker>
    );
  }
  if (!loaded) return <ListSkeleton />;

  if (active.length === 0 && done.length === 0) {
    return (
      <Sticker tone="panel" className="px-0 py-0">
        <EmptyState
          glyph={<FlagIcon className="size-7" />}
          title="No matches yet"
          body="Post a challenge or accept one from the board to get started."
          action={<ButtonLink href="/create">Create challenge</ButtonLink>}
        />
      </Sticker>
    );
  }

  const mySide = (challenge: import('@/lib/escrow/types').Challenge) =>
    compactAddress(challenge.host.address) === compactAddress(myAddress)
      ? ('host' as const)
      : ('guest' as const);

  return (
    <div className="space-y-5">
      {active.length > 0 && (
        <div>
          <Eyebrow className="mb-2 text-faint">Ongoing</Eyebrow>
          {/* Cards rather than rows: a match in progress is always waiting on
              somebody for something, and saying who won is the point of the
              whole thing — neither should need another screen to reach. */}
          <ul className="space-y-2.5">
            {active.map((challenge) => (
              <li key={challenge.id}>
                <MatchCard
                  challenge={challenge}
                  mySide={mySide(challenge)}
                  address={myAddress}
                  onChanged={onChanged}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {done.length > 0 && (
        <div>
          <Eyebrow className="mb-2 text-faint">Done</Eyebrow>
          {/* Also cards: the outcome of a match — that you won, and that the
              pot was sent — is the last thing a player wants to see, and a
              one-line row cannot say it. */}
          <ul className="space-y-2.5">
            {done.map((challenge) => (
              <li key={challenge.id}>
                <MatchCard
                  challenge={challenge}
                  mySide={mySide(challenge)}
                  address={myAddress}
                  onChanged={onChanged}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EscrowUnavailable() {
  return (
    <Sticker tone="panel">
      <p className="text-[0.875rem] font-bold">Escrow is not configured</p>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
        This deployment has no treasury or database set up yet, so challenges cannot be
        posted, funded or settled for real. Use Drafts in the meantime.
      </p>
    </Sticker>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1].map((i) => (
        <div key={i} className="h-16 rounded-xl bg-panel-2 animate-[var(--animate-shimmer)]" />
      ))}
    </div>
  );
}

function DraftRow({ draft, onDelete }: { draft: ChallengeDraft; onDelete: () => void }) {
  return (
    <article className="rounded-[var(--radius-sticker)] border-2 border-line bg-panel p-4 animate-[var(--animate-rise)]">
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-contrast text-accent"
        >
          <SwordsIcon className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="display truncate text-[1.0625rem]">{draftTitle(draft)}</p>
          <p className="mt-1 text-[0.75rem] text-faint">
            {draft.opponentMode === 'open'
              ? 'Open to anyone'
              : draft.opponentUsername
                ? `vs @${draft.opponentUsername}`
                : `vs ${draft.opponent ? shortenAddress(draft.opponent) : 'opponent'}`}
          </p>
        </div>

        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${draftTitle(draft)} draft`}
          className="-m-2 flex size-11 items-center justify-center rounded-full text-faint transition-colors active:text-negative"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3 border-t-2 border-line pt-3.5">
        <div>
          <p className="eyebrow text-faint">Pot</p>
          <p className="mt-0.5 text-[1.125rem] font-black tracking-tight tabular">
            {(draft.stake * 2).toLocaleString()}
            <span className="ml-1 text-[0.75rem] text-faint">{draft.currency}</span>
          </p>
        </div>
        <Chip tone="warn">Draft · not funded</Chip>
      </div>

      {draft.note && (
        <p className="mt-3 rounded-xl bg-panel-2 px-3 py-2.5 text-[0.75rem] italic leading-snug text-muted">
          “{draft.note}”
        </p>
      )}
    </article>
  );
}
