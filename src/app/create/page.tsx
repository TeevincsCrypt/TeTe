'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { CheckIcon, ChevronLeftIcon, GlobeIcon, SwordsIcon, TargetIcon } from '@/components/shell/icons';
import { FormatArt } from '@/components/challenges/FormatArt';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { copyText } from '@/lib/clipboard';
import { saveDraft } from '@/lib/challenges/drafts';
import { challengeUrl, encodeChallenge } from '@/lib/challenges/share';
import { pushNotice } from '@/lib/notifications/notifications';
import { defaultHandle } from '@/lib/profile/local-profile';
import { useLocalProfile } from '@/state/use-local-profile';
import { CHALLENGE_FORMATS, type ChallengeFormatId, type OpponentMode } from '@/lib/challenges/types';
import { createId } from '@/lib/ids';
import { compactAddress } from '@/lib/nimiq/address';
import { nimToLuna } from '@/lib/nimiq/units';
import type { RosterPlayer } from '@/lib/roster/roster';
import { useMiniApp } from '@/state/mini-app-provider';
import {
  ApiError,
  createChallenge,
  fetchStatus,
  lookupPlayer,
  type BackendStatus,
} from '@/lib/api/client';
import type { StakeCurrency } from '@/types';

/**
 * Convert a stake typed in the create form to the smallest unit the API
 * stores. NIM maps to real Luna, the unit the chain uses. USDT has no working
 * on-chain verification yet (see the funding screen), so its "smallest unit"
 * here is just cents, kept only for consistent display until that exists.
 */
function toSmallestUnit(currency: StakeCurrency, value: number): number {
  return currency === 'NIM' ? nimToLuna(value) : Math.round(value * 100);
}

const QUICK_STAKES: Record<StakeCurrency, readonly number[]> = {
  NIM: [50, 100, 500, 1000],
  USDT: [1, 5, 10, 25],
};

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="pt-10" />}>
      <CreateFlow />
    </Suspense>
  );
}

/**
 * Building a challenge.
 *
 * The form is genuinely functional: it validates, computes the real pot, and
 * saves what you configure. What it does NOT do is move money — escrow,
 * invitations and settlement are Phase 2. So the final step saves a local draft
 * and says exactly that, rather than showing a fake transaction succeeding.
 */
function CreateFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { nimiq } = useMiniApp();
  const { displayName } = useLocalProfile();

  const initialFormat = (params.get('format') as ChallengeFormatId | null) ?? null;

  const [step, setStep] = useState(initialFormat ? 1 : 0);
  const [format, setFormat] = useState<ChallengeFormatId | null>(initialFormat);
  const [customTitle, setCustomTitle] = useState('');
  const [currency, setCurrency] = useState<StakeCurrency>('NIM');
  const [stake, setStake] = useState('');
  const [opponentMode, setOpponentMode] = useState<OpponentMode>('open');
  const [rival, setRival] = useState<RosterPlayer | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<{ link: string; path: string | null } | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // `null` while the check is in flight. Posting for real needs the treasury,
  // not just the store — asking only whether the API answers would put a "Post
  // challenge" button in front of a deployment whose POST returns 503.
  const [status, setStatus] = useState<BackendStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stakeValue = Number.parseFloat(stake);
  const stakeValid = Number.isFinite(stakeValue) && stakeValue > 0;
  const opponentValid = opponentMode === 'open' || rival !== null;
  const formatValid = format !== null && (format !== 'custom' || customTitle.trim().length > 0);

  const canContinue = [formatValid, stakeValid, opponentValid][step] ?? false;
  // Posting for real needs escrow (store AND treasury) plus a connected wallet
  // to sign with — either missing, and the challenge is saved as a local draft
  // instead. Checking escrow rather than merely "the API answered" is what
  // keeps this button honest on a half-configured deployment.
  const canPostForReal = status?.escrow === true && Boolean(nimiq.address);

  async function handleSave() {
    if (!format || !stakeValid) return;

    if (canPostForReal && nimiq.address) {
      setPosting(true);
      setPostError(null);
      try {
        const challenge = await createChallenge(nimiq.address, {
          format,
          title: format === 'custom' ? customTitle.trim() : undefined,
          currency,
          stake: toSmallestUnit(currency, stakeValue),
          note: note.trim() || undefined,
          opponent: opponentMode === 'direct' ? (rival?.username ?? undefined) : undefined,
        });
        pushNotice('challenge', 'Challenge posted', `${currency} ${stakeValue} · live now`);
        const path = `/challenges/${challenge.id}`;
        setSaved({ link: `${window.location.origin}${path}`, path });
      } catch (cause: unknown) {
        setPostError(cause instanceof ApiError ? cause.message : 'Could not post that challenge.');
      } finally {
        setPosting(false);
      }
      return;
    }

    const draft = {
      id: createId(),
      format,
      customTitle: format === 'custom' ? customTitle.trim() : undefined,
      currency,
      stake: stakeValue,
      opponentMode,
      opponent: opponentMode === 'direct' ? (rival?.address ?? undefined) : undefined,
      opponentUsername: opponentMode === 'direct' ? (rival?.username ?? undefined) : undefined,
      note: note.trim() || undefined,
      createdAt: Date.now(),
    };
    saveDraft(draft);
    pushNotice('challenge', 'Challenge draft saved', `${draft.currency} ${draft.stake} · ready to share`);
    setSaved({
      link: challengeUrl(encodeChallenge(draft, nimiq.address, displayName ?? defaultHandle(nimiq.address))),
      path: null,
    });
  }

  if (saved) {
    return (
      <SavedConfirmation
        link={saved.link}
        live={saved.path !== null}
        onDone={() => router.push(saved.path ?? '/challenges')}
      />
    );
  }

  return (
    <div className="space-y-5 pt-2">
      <header>
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              aria-label="Back"
              className="-ml-2 flex size-11 items-center justify-center rounded-full text-muted transition-colors active:text-text"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
          )}
          <div>
            <Eyebrow className="text-faint">Step {step + 1} of 3</Eyebrow>
            <h1 className="display mt-1 text-[1.75rem]">
              {['Pick the game', 'Set the stake', 'Choose opponent'][step]}
            </h1>
          </div>
        </div>

        <div className="mt-4 flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-300',
                index <= step ? 'bg-contrast' : 'bg-contrast/12',
              )}
            />
          ))}
        </div>
      </header>

      {step === 0 && (
        <FormatStep
          format={format}
          onFormat={setFormat}
          customTitle={customTitle}
          onCustomTitle={setCustomTitle}
        />
      )}

      {step === 1 && (
        <StakeStep
          currency={currency}
          onCurrency={setCurrency}
          stake={stake}
          onStake={setStake}
          stakeValue={stakeValue}
          stakeValid={stakeValid}
        />
      )}

      {step === 2 && (
        <OpponentStep
          mode={opponentMode}
          onMode={setOpponentMode}
          rival={rival}
          onRival={setRival}
          note={note}
          onNote={setNote}
          selfAddress={nimiq.address}
        />
      )}

      <div className="space-y-3">
        {step < 2 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue} size="lg">
            Continue
          </Button>
        ) : (
          <>
            <Button onClick={handleSave} disabled={!canContinue} loading={posting} size="lg">
              {canPostForReal ? 'Post challenge' : 'Save challenge draft'}
            </Button>
            {postError && (
              <p role="alert" className="text-[0.8125rem] font-semibold text-negative">
                {postError}
              </p>
            )}
            {canPostForReal ? (
              <PhaseNote>
                Posting asks Nimiq Pay to sign it — no money moves yet. Funding is the next
                step, once your opponent has accepted.
              </PhaseNote>
            ) : (
              <PhaseNote>
                {status === null
                  ? 'Checking what this deployment can do…'
                  : !status.escrow
                    ? status.store
                      ? 'The treasury is not configured on this deployment, so challenges cannot be funded or settled yet. This saves to your device only.'
                      : 'Escrow is not configured on this deployment, so this saves to your device only. Nothing is funded and no opponent is notified.'
                    : 'Connect your wallet to post this for real. Saved for now on your device only.'}
              </PhaseNote>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FormatStep({
  format,
  onFormat,
  customTitle,
  onCustomTitle,
}: {
  format: ChallengeFormatId | null;
  onFormat: (id: ChallengeFormatId) => void;
  customTitle: string;
  onCustomTitle: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {CHALLENGE_FORMATS.map((option) => {
          const active = option.id === format;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onFormat(option.id)}
              aria-pressed={active}
              className={cn(
                'overflow-hidden rounded-2xl text-left transition-all duration-150 active:scale-[0.97]',
                active ? 'bg-contrast text-on-contrast ring-2 ring-accent' : 'bg-panel-2 text-text',
              )}
            >
              <FormatArt id={option.id} rounded="rounded-none" className="h-16 w-full" />
              <span className="block p-3.5">
                <span className="block text-[1rem] font-black tracking-tight">{option.name}</span>
                <span
                  className={cn(
                    'mt-0.5 block text-[0.6875rem] leading-snug',
                    active ? 'text-on-contrast/70' : 'text-faint',
                  )}
                >
                  {option.tagline}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {format === 'custom' && (
        <Sticker tone="panel" className="animate-[var(--animate-pop)]">
          <label htmlFor="custom-title" className="eyebrow text-faint">
            What is the contest?
          </label>
          <input
            id="custom-title"
            value={customTitle}
            onChange={(event) => onCustomTitle(event.target.value)}
            placeholder="e.g. Fastest Rubik's cube solve"
            maxLength={60}
            className="mt-2 w-full rounded-xl border border-line bg-panel-2 px-3.5 py-3 text-[0.9375rem] font-semibold text-text placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <p className="mt-2 text-[0.6875rem] text-faint">
            Both players must agree how a winner is decided.
          </p>
        </Sticker>
      )}
    </div>
  );
}

function StakeStep({
  currency,
  onCurrency,
  stake,
  onStake,
  stakeValue,
  stakeValid,
}: {
  currency: StakeCurrency;
  onCurrency: (value: StakeCurrency) => void;
  stake: string;
  onStake: (value: string) => void;
  stakeValue: number;
  stakeValid: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {(['NIM', 'USDT'] as const).map((option) => {
          const active = option === currency;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onCurrency(option)}
              aria-pressed={active}
              className={cn(
                'min-h-14 rounded-full text-[1rem] font-black tracking-tight transition-all duration-150 active:scale-[0.97]',
                active
                  ? option === 'NIM'
                    ? 'border-line bg-accent text-on-accent shadow-[var(--shadow-sticker)]'
                    : 'border-line bg-violet text-white shadow-[var(--shadow-sticker)]'
                  : 'border-line bg-panel text-muted',
              )}
            >
              {option}
            </button>
          );
        })}
      </div>

      <Sticker tone="panel">
        <label htmlFor="stake" className="eyebrow text-faint">
          Stake per player
        </label>
        <div className="mt-2 flex items-baseline gap-2">
          <input
            id="stake"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={stake}
            onChange={(event) => onStake(event.target.value)}
            placeholder="0"
            className="w-full min-w-0 bg-transparent text-[2.25rem] font-black tracking-[-0.03em] text-text tabular placeholder:text-faint focus:outline-none"
          />
          <span className="shrink-0 text-[1rem] font-black text-faint">{currency}</span>
        </div>

        <div className="mt-3 flex gap-2">
          {QUICK_STAKES[currency].map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => onStake(String(amount))}
              className="min-h-10 flex-1 rounded-full border-2 border-line text-[0.8125rem] font-bold text-muted transition-colors active:border-accent active:text-accent-text"
            >
              {amount}
            </button>
          ))}
        </div>
      </Sticker>

      <div
        className={cn(
          'rounded-2xl bg-contrast p-5 transition-opacity duration-200',
          stakeValid ? 'opacity-100' : 'opacity-40',
        )}
      >
        <p className="eyebrow text-on-contrast/60">Winner takes</p>
        <p className="display mt-1 text-[2rem] text-on-contrast tabular">
          {stakeValid ? (stakeValue * 2).toLocaleString() : '0'}
          <span className="ml-2 text-[1rem]">{currency}</span>
        </p>
        <p className="mt-1 text-[0.75rem] font-semibold text-on-contrast/70">
          Both players stake {stakeValid ? stakeValue.toLocaleString() : '0'} {currency}.
        </p>
      </div>
    </div>
  );
}

function OpponentStep({
  mode,
  onMode,
  rival,
  onRival,
  note,
  onNote,
  selfAddress,
}: {
  mode: OpponentMode;
  onMode: (mode: OpponentMode) => void;
  rival: RosterPlayer | null;
  onRival: (player: RosterPlayer | null) => void;
  note: string;
  onNote: (value: string) => void;
  selfAddress: string | null;
}) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'searching' | 'found' | 'missing' | 'offline'>('idle');
  const [error, setError] = useState<string | null>(null);

  // The name is resolved as it is typed. Nobody types an address here any
  // more: the directory turns a handle into one.
  useEffect(() => {
    const query = name.trim();
    if (query.length < 3) {
      setStatus('idle');
      onRival(null);
      return;
    }

    let cancelled = false;
    setStatus('searching');
    const timer = setTimeout(async () => {
      try {
        const found = await lookupPlayer(query);
        if (cancelled) return;
        if (!found) {
          setError(null);
          setStatus('missing');
          onRival(null);
          return;
        }
        if (selfAddress && compactAddress(found.address) === compactAddress(selfAddress)) {
          setError('That is you.');
          setStatus('missing');
          onRival(null);
          return;
        }
        setError(null);
        setStatus('found');
        onRival({ id: found.address, username: found.username, address: found.address, addedAt: Date.now() });
      } catch (cause: unknown) {
        if (cancelled) return;
        // A deployment without the directory configured answers 503.
        setStatus(cause instanceof ApiError && cause.status === 503 ? 'offline' : 'missing');
        onRival(null);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, onRival, selfAddress]);

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        <ModeOption
          active={mode === 'open'}
          onSelect={() => onMode('open')}
          glyph={<GlobeIcon className="size-5" />}
          title="Open challenge"
          body="Anyone can accept it from the board."
        />
        <ModeOption
          active={mode === 'direct'}
          onSelect={() => onMode('direct')}
          glyph={<TargetIcon className="size-5" />}
          title="Challenge a player"
          body="Call someone out by their username."
        />
      </div>

      {mode === 'direct' && (
        <div className="space-y-3 animate-[var(--animate-pop)]">
          <Sticker tone="panel">
            <label htmlFor="rival" className="eyebrow text-faint">
              Their username
            </label>
            <div className="mt-2.5 flex items-center rounded-xl border border-line bg-panel-2 pl-3.5 focus-within:border-accent">
              <span className="text-[1rem] font-black text-faint">@</span>
              <input
                id="rival"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={16}
                className="w-full min-w-0 bg-transparent px-1.5 py-3 text-[1rem] font-bold text-text placeholder:text-faint focus:outline-none"
              />
              {status === 'searching' && (
                <span className="mr-3 size-4 shrink-0 animate-spin rounded-full border-2 border-faint border-t-transparent" />
              )}
            </div>

            {status === 'missing' && (
              <p className="mt-2 text-[0.75rem] font-semibold text-negative">
                {error ?? `No player called @${name.trim()} yet. They claim their name in TeTe first.`}
              </p>
            )}
            {status === 'offline' && (
              <p className="mt-2 text-[0.75rem] font-semibold text-gold">
                The player directory is not configured on this deployment.
              </p>
            )}
          </Sticker>

          {rival && status === 'found' && (
            <div className="rounded-2xl bg-contrast p-4 animate-[var(--animate-pop)]">
              <Eyebrow className="text-on-contrast/60">Opponent</Eyebrow>
              <div className="mt-2.5 flex items-center gap-3">
                <Avatar address={rival.address} size={40} />
                <p className="display text-[1.125rem] text-on-contrast">@{rival.username}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <Sticker tone="panel">
        <label htmlFor="note" className="eyebrow text-faint">
          Rules or trash talk <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(event) => onNote(event.target.value)}
          rows={3}
          maxLength={200}
          placeholder="Best of three. No takebacks."
          className="mt-2 w-full resize-none rounded-xl border border-line bg-panel-2 px-3.5 py-3 text-[0.875rem] text-text placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-right text-[0.6875rem] text-faint tabular">{note.length}/200</p>
      </Sticker>
    </div>
  );
}

function ModeOption({
  active,
  onSelect,
  glyph,
  title,
  body,
}: {
  active: boolean;
  onSelect: () => void;
  glyph: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-2xl p-4 text-left transition-all duration-150 active:scale-[0.98]',
        active ? 'bg-contrast text-on-contrast' : 'bg-panel-2 text-text',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
          active ? 'bg-on-contrast/15 text-accent' : 'bg-panel-2 text-muted',
        )}
      >
        {glyph}
      </span>
      <span className="flex-1">
        <span className="block text-[0.9375rem] font-black tracking-tight">{title}</span>
        <span className={cn('mt-0.5 block text-[0.75rem] leading-snug', active ? 'text-on-contrast/70' : 'text-faint')}>
          {body}
        </span>
      </span>
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border',
          active ? 'border-accent bg-accent text-on-accent' : 'border-line',
        )}
      >
        {active && <CheckIcon className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

function SavedConfirmation({ link, live, onDone }: { link: string; live: boolean; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    // The Web Share sheet is the natural route on a phone; copying is the
    // fallback where it is unavailable or dismissed.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TeTe challenge', text: 'I am challenging you on TeTe', url: link });
        return;
      } catch {
        /* Dismissed — fall through to copying. */
      }
    }
    setCopied(await copyText(link));
  }

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
      <span
        aria-hidden
        className="flex size-20 items-center justify-center rounded-3xl bg-contrast text-accent animate-[var(--animate-pop)]"
      >
        <SwordsIcon className="size-9" />
      </span>
      <h2 className="display mt-6 text-[2rem]">{live ? 'Challenge posted' : 'Draft saved'}</h2>
      <p className="mt-3 max-w-[18rem] text-[0.875rem] leading-relaxed text-muted">
        {live
          ? 'It is live. Share the link, or wait for the player it is aimed at to open TeTe.'
          : 'It is stored on this device and ready to post once escrow is available.'}
      </p>
      <Chip tone="warn" className="mt-4">
        {live ? 'Not funded yet · Awaiting acceptance' : 'Not funded · No money moved'}
      </Chip>
      <div className="mt-8 w-full max-w-[17rem] space-y-2.5">
        <Button onClick={share} size="lg">
          {copied ? 'Link copied' : 'Share challenge link'}
        </Button>
        <Button variant="outline" onClick={onDone}>
          {live ? 'View challenge' : 'View my challenges'}
        </Button>
      </div>

      <p className="mt-5 max-w-[18rem] text-[0.75rem] leading-relaxed text-faint">
        The link carries the terms, so anyone can open it — no account needed. Nothing is
        funded until escrow ships.
      </p>
    </div>
  );
}
