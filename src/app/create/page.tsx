'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { CheckIcon, ChevronLeftIcon, GlobeIcon, SwordsIcon, TargetIcon } from '@/components/shell/icons';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { saveDraft } from '@/lib/challenges/drafts';
import { CHALLENGE_FORMATS, type ChallengeFormatId, type OpponentMode } from '@/lib/challenges/types';
import { createId } from '@/lib/ids';
import { shortenAddress } from '@/lib/nimiq/address';
import type { RosterPlayer } from '@/lib/roster/roster';
import { useMiniApp } from '@/state/mini-app-provider';
import { useRoster } from '@/state/use-roster';
import type { StakeCurrency } from '@/types';

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

  const initialFormat = (params.get('format') as ChallengeFormatId | null) ?? null;

  const [step, setStep] = useState(initialFormat ? 1 : 0);
  const [format, setFormat] = useState<ChallengeFormatId | null>(initialFormat);
  const [customTitle, setCustomTitle] = useState('');
  const [currency, setCurrency] = useState<StakeCurrency>('NIM');
  const [stake, setStake] = useState('');
  const [opponentMode, setOpponentMode] = useState<OpponentMode>('open');
  const [rival, setRival] = useState<RosterPlayer | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  const stakeValue = Number.parseFloat(stake);
  const stakeValid = Number.isFinite(stakeValue) && stakeValue > 0;
  const opponentValid = opponentMode === 'open' || rival !== null;
  const formatValid = format !== null && (format !== 'custom' || customTitle.trim().length > 0);

  const canContinue = [formatValid, stakeValid, opponentValid][step] ?? false;

  function handleSave() {
    if (!format || !stakeValid) return;
    saveDraft({
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
    });
    setSaved(true);
  }

  if (saved) return <SavedConfirmation onDone={() => router.push('/challenges')} />;

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
                index <= step ? 'bg-ink' : 'bg-ink/12',
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
            <Button onClick={handleSave} disabled={!canContinue} size="lg">
              Save challenge draft
            </Button>
            <PhaseNote>
              Saving keeps this challenge on your device. It is not funded, not sent
              to anyone, and no money moves — escrow and invites land in the next phase.
            </PhaseNote>
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
                'rounded-[var(--radius-sticker)] border-2 p-4 text-left transition-all duration-150',
                'active:scale-[0.97]',
                active
                  ? 'border-ink bg-accent text-ink shadow-[var(--shadow-sticker)]'
                  : 'border-line bg-panel text-text',
              )}
            >
              <p className="text-[1.0625rem] font-black tracking-tight">{option.name}</p>
              <p className={cn('mt-1 text-[0.6875rem] leading-snug', active ? 'text-on-contrast/70' : 'text-faint')}>
                {option.tagline}
              </p>
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
            className="mt-2 w-full rounded-xl border border-ink/12 bg-panel-2 px-3.5 py-3 text-[0.9375rem] font-semibold text-text placeholder:text-faint focus:border-accent focus:outline-none"
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
                    ? 'border-ink bg-accent text-ink shadow-[var(--shadow-sticker)]'
                    : 'border-ink bg-violet text-white shadow-[var(--shadow-sticker)]'
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
              className="min-h-10 flex-1 rounded-full border-2 border-ink/15 text-[0.8125rem] font-bold text-muted transition-colors active:border-accent active:text-accent-text"
            >
              {amount}
            </button>
          ))}
        </div>
      </Sticker>

      <div
        className={cn(
          'rounded-2xl bg-ink p-5 transition-opacity duration-200',
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
  const { players, add } = useRoster();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        <ModeOption
          active={mode === 'open'}
          onSelect={() => onMode('open')}
          glyph={<GlobeIcon className="size-5" />}
          title="Open challenge"
          body="Anyone can accept it from the marketplace."
        />
        <ModeOption
          active={mode === 'direct'}
          onSelect={() => onMode('direct')}
          glyph={<TargetIcon className="size-5" />}
          title="Challenge a player"
          body="Send it to someone on your roster, by username."
        />
      </div>

      {mode === 'direct' && (
        <div className="space-y-3 animate-[var(--animate-pop)]">
          {players.length > 0 && (
            <Sticker tone="panel">
              <Eyebrow className="text-faint">Your roster</Eyebrow>
              <div className="mt-3 flex flex-wrap gap-2">
                {players.map((player) => {
                  const active = rival?.id === player.id;
                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => onRival(active ? null : player)}
                      aria-pressed={active}
                      className={cn(
                        'flex min-h-11 items-center gap-2 rounded-full px-3 pr-4',
                        'text-[0.8125rem] font-bold transition-all duration-150 active:scale-95',
                        active
                          ? 'bg-accent text-on-accent'
                          : 'bg-panel-2 text-muted',
                      )}
                    >
                      <Avatar address={player.address} size={24} />@{player.username}
                    </button>
                  );
                })}
              </div>
            </Sticker>
          )}

          {rival && (
            <div className="rounded-2xl bg-ink p-4 animate-[var(--animate-pop)]">
              <Eyebrow className="text-on-contrast/60">Opponent</Eyebrow>
              <div className="mt-2.5 flex items-center gap-3">
                <Avatar address={rival.address} size={40} />
                <div className="min-w-0">
                  <p className="display text-[1.125rem] text-on-contrast">@{rival.username}</p>
                  <p className="truncate font-mono text-[0.6875rem] text-on-contrast/60">
                    {shortenAddress(rival.address)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {adding ? (
            <AddPlayerForm
              selfAddress={selfAddress}
              onCancel={() => setAdding(false)}
              onAdd={(username, address) => {
                const result = add(username, address);
                if (result.ok) {
                  onRival(result.player);
                  setAdding(false);
                }
                return result;
              }}
            />
          ) : (
            <Button variant="outline" onClick={() => setAdding(true)}>
              + Add a player
            </Button>
          )}

          {players.length === 0 && !adding && (
            <PhaseNote>
              TeTe has no global username directory yet, so you add a player once with
              their address and can challenge them by name from then on.
            </PhaseNote>
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
          className="mt-2 w-full resize-none rounded-xl border border-ink/12 bg-panel-2 px-3.5 py-3 text-[0.875rem] text-text placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-right text-[0.6875rem] text-faint tabular">{note.length}/200</p>
      </Sticker>
    </div>
  );
}

/**
 * Saving a new opponent. The address is required exactly once — TeTe cannot
 * resolve a username to an address on its own, so the first introduction has to
 * carry one. After that the player is reachable by name.
 */
function AddPlayerForm({
  onAdd,
  onCancel,
  selfAddress,
}: {
  onAdd: (username: string, address: string) => { ok: boolean; error?: string };
  onCancel: () => void;
  selfAddress: string | null;
}) {
  const [username, setUsername] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isSelf =
    selfAddress !== null &&
    address.replace(/\s+/g, '').toUpperCase() === selfAddress.replace(/\s+/g, '').toUpperCase();

  function submit() {
    if (isSelf) {
      setError('That is your own address — you cannot challenge yourself.');
      return;
    }
    const result = onAdd(username, address);
    if (!result.ok) setError(result.error ?? 'Could not add that player.');
  }

  return (
    <Sticker tone="panel" className="animate-[var(--animate-pop)]">
      <Eyebrow className="text-faint">New player</Eyebrow>

      <label htmlFor="username" className="sr-only">
        Username
      </label>
      <div className="mt-2.5 flex items-center rounded-xl border border-ink/12 bg-panel-2 pl-3.5 focus-within:border-accent">
        <span className="text-[0.9375rem] font-black text-faint">@</span>
        <input
          id="username"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setError(null);
          }}
          placeholder="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={16}
          className="w-full min-w-0 bg-transparent px-1.5 py-3 text-[0.9375rem] font-bold text-text placeholder:text-faint focus:outline-none"
        />
      </div>

      <label htmlFor="address" className="sr-only">
        Their Nimiq address
      </label>
      <input
        id="address"
        value={address}
        onChange={(event) => {
          setAddress(event.target.value);
          setError(null);
        }}
        placeholder="NQ.. .. .. .."
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="mt-2 w-full rounded-xl border border-ink/12 bg-panel-2 px-3.5 py-3 font-mono text-[0.8125rem] text-text placeholder:text-faint focus:border-accent focus:outline-none"
      />

      {error && (
        <p role="alert" className="mt-2 text-[0.75rem] font-semibold text-negative">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!username.trim() || !address.trim()}>
          Save player
        </Button>
      </div>
    </Sticker>
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
        active ? 'bg-ink text-on-contrast' : 'bg-panel-2 text-text',
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
          active ? 'border-accent bg-accent text-ink' : 'border-ink/20',
        )}
      >
        {active && <CheckIcon className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

function SavedConfirmation({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
      <span
        aria-hidden
        className="flex size-20 items-center justify-center rounded-3xl bg-ink text-accent animate-[var(--animate-pop)]"
      >
        <SwordsIcon className="size-9" />
      </span>
      <h2 className="display mt-6 text-[2rem]">Draft saved</h2>
      <p className="mt-3 max-w-[18rem] text-[0.875rem] leading-relaxed text-muted">
        It is stored on this device and ready to fund the moment escrow ships.
      </p>
      <Chip tone="warn" className="mt-4">
        Not funded · No money moved
      </Chip>
      <div className="mt-8 w-full max-w-[16rem]">
        <Button onClick={onDone} size="lg">
          View my challenges
        </Button>
      </div>
    </div>
  );
}
