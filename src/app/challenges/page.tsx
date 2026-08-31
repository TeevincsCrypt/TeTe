'use client';

import { useState } from 'react';

import { BoltIcon, FlagIcon, NoteIcon, SwordsIcon, TrashIcon } from '@/components/shell/icons';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { draftTitle, type ChallengeDraft } from '@/lib/challenges/types';
import { shortenAddress } from '@/lib/nimiq/address';
import { useDrafts } from '@/state/use-drafts';

type Tab = 'drafts' | 'active' | 'done';

/**
 * The player's challenges.
 *
 * Drafts are real objects the player built and are stored on this device.
 * Active and Done are genuinely empty and will stay that way until escrow and
 * settlement exist — so rather than invent rows, those tabs explain what will
 * fill them.
 */
export default function ChallengesPage() {
  const { drafts, loaded, remove } = useDrafts();
  const [tab, setTab] = useState<Tab>('drafts');

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
          { id: 'drafts', label: 'Drafts', count: drafts.length },
          { id: 'active', label: 'Active' },
          { id: 'done', label: 'Done' },
        ]}
      />

      {tab === 'drafts' && (
        <div className="space-y-3">
          {!loaded && <div className="h-28 rounded-[var(--radius-sticker)] border-2 border-line bg-panel animate-[var(--animate-shimmer)]" />}

          {loaded && drafts.length === 0 && (
            <Sticker tone="panel" className="px-0 py-0">
              <EmptyState
                glyph={<NoteIcon className="size-7" />}
                title="No drafts yet"
                body="Build a challenge and it lands here, ready to fund when escrow ships."
                action={<ButtonLink href="/create">Create challenge</ButtonLink>}
              />
            </Sticker>
          )}

          {loaded && drafts.length > 0 && (
            <>
              {drafts.map((draft) => (
                <DraftRow key={draft.id} draft={draft} onDelete={() => remove(draft.id)} />
              ))}
              <PhaseNote>
                Drafts live only on this device. Nothing is funded and no opponent has
                been notified — that needs escrow, which is the next thing being built.
              </PhaseNote>
            </>
          )}
        </div>
      )}

      {tab === 'active' && (
        <Sticker tone="panel" className="px-0 py-0">
          <EmptyState
            glyph={<BoltIcon className="size-7" />}
            title="Nothing live"
            body="Once both players fund a challenge, the match appears here with its stake locked in escrow."
          />
        </Sticker>
      )}

      {tab === 'done' && (
        <Sticker tone="panel" className="px-0 py-0">
          <EmptyState
            glyph={<FlagIcon className="size-7" />}
            title="No results yet"
            body="Finished matches, confirmed results and payouts will be listed here."
          />
        </Sticker>
      )}
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
