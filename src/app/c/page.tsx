'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { SwordsIcon } from '@/components/shell/icons';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { decodeChallenge } from '@/lib/challenges/share';
import { formatById } from '@/lib/challenges/types';
import { shortenAddress } from '@/lib/nimiq/address';

/**
 * An incoming challenge, opened from a shared link.
 *
 * Everything shown is decoded from the URL — there is no lookup, because there
 * is no server to look anything up in. Accepting needs escrow, so this screen
 * presents the terms and says plainly what is not yet possible.
 */
export default function ChallengeLinkPage() {
  return (
    <Suspense fallback={<div className="pt-10" />}>
      <Incoming />
    </Suspense>
  );
}

function Incoming() {
  const params = useSearchParams();
  const challenge = decodeChallenge(params);

  if (!challenge) {
    return (
      <div className="pt-8">
        <h1 className="display text-[1.75rem]">Link not readable</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          That challenge link is missing or malformed. Ask whoever sent it to share it again.
        </p>
        <ButtonLink href="/" className="mt-6">
          Go to TeTe
        </ButtonLink>
      </div>
    );
  }

  const format = formatById(challenge.format);
  const title = challenge.title?.trim() || format.name;

  return (
    <div className="pt-4">
      <Eyebrow className="text-faint">You have been challenged</Eyebrow>

      <div className="mt-4 rounded-3xl bg-contrast p-6 text-on-contrast">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-on-accent">
          <SwordsIcon className="size-6" />
        </span>
        <h1 className="display mt-4 text-[2rem]">{title}</h1>
        <p className="mt-1.5 text-[0.875rem] text-on-contrast/65">
          {challenge.fromName ? `@${challenge.fromName}` : 'A player'}
          {challenge.from ? ` · ${shortenAddress(challenge.from)}` : ''}
        </p>

        <div className="mt-6 border-t border-on-contrast/15 pt-5">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-on-contrast/50">
            Winner takes
          </p>
          <p className="mt-1 text-[2.25rem] font-black leading-none tracking-[-0.035em] tabular">
            {(challenge.stake * 2).toLocaleString()}
            <span className="ml-2 text-[1rem] text-on-contrast/55">{challenge.currency}</span>
          </p>
          <p className="mt-1.5 text-[0.75rem] text-on-contrast/60">
            Both players stake {challenge.stake.toLocaleString()} {challenge.currency}.
          </p>
        </div>

        {challenge.note && (
          <p className="mt-4 rounded-xl bg-on-contrast/10 px-3.5 py-3 text-[0.8125rem] italic leading-snug text-on-contrast/75">
            “{challenge.note}”
          </p>
        )}
      </div>

      <Chip tone="warn" className="mt-4">
        Terms only · nothing funded
      </Chip>

      <PhaseNote className="mt-3">
        This link carries the terms and nothing else. Accepting means both sides funding
        an escrow, which is the next thing being built — until then no money moves and
        neither player is committed.
      </PhaseNote>

      <div className="mt-5 space-y-2.5">
        <ButtonLink href="/create">Set up your own</ButtonLink>
        <Link
          href="/"
          className="flex min-h-12 w-full items-center justify-center rounded-full text-[0.875rem] font-bold text-muted active:text-text"
        >
          Open TeTe
        </Link>
      </div>
    </div>
  );
}
