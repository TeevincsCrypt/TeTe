'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { CheckIcon, ChevronLeftIcon } from '@/components/shell/icons';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { saveDraft } from '@/lib/challenges/drafts';
import { CHALLENGE_FORMATS, type ChallengeFormatId, type OpponentMode } from '@/lib/challenges/types';
import { createId } from '@/lib/ids';
import { isNimiqAddressShape } from '@/lib/nimiq/address';
import { useMiniApp } from '@/state/mini-app-provider';
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
  const [opponent, setOpponent] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  const stakeValue = Number.parseFloat(stake);
  const stakeValid = Number.isFinite(stakeValue) && stakeValue > 0;
  const opponentValid = opponentMode === 'open' || isNimiqAddressShape(opponent);
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
      opponent: opponentMode === 'direct' ? opponent.trim() : undefined,
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
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                index <= step ? 'bg-lime' : 'bg-line',
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
          opponent={opponent}
          onOpponent={setOpponent}
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
                  ? 'border-ink bg-lime text-ink shadow-[var(--shadow-sticker)]'
                  : 'border-line bg-panel text-text',
              )}
            >
              <span aria-hidden className="text-[1.5rem] leading-none">
                {option.icon}
              </span>
              <p className="display mt-3 text-[1rem]">{option.name}</p>
              <p className={cn('mt-1 text-[0.6875rem] leading-snug', active ? 'text-ink/65' : 'text-faint')}>
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
            className="mt-2 w-full rounded-xl border-2 border-line bg-ink px-3.5 py-3 text-[0.9375rem] font-semibold text-text placeholder:text-faint focus:border-lime focus:outline-none"
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
                'min-h-14 rounded-full border-2 text-[1rem] font-black tracking-tight transition-all duration-150 active:scale-[0.97]',
                active
                  ? option === 'NIM'
                    ? 'border-ink bg-lime text-ink shadow-[var(--shadow-sticker)]'
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
              className="min-h-10 flex-1 rounded-full border-2 border-line text-[0.8125rem] font-bold text-muted transition-colors active:border-lime active:text-lime"
            >
              {amount}
            </button>
          ))}
        </div>
      </Sticker>

      <div
        className={cn(
          'rounded-[var(--radius-sticker)] border-2 border-ink bg-cream p-4 transition-opacity duration-200',
          stakeValid ? 'opacity-100' : 'opacity-40',
        )}
      >
        <p className="eyebrow text-ink/50">Winner takes</p>
        <p className="display mt-1 text-[2rem] text-ink tabular">
          {stakeValid ? (stakeValue * 2).toLocaleString() : '0'}
          <span className="ml-2 text-[1rem]">{currency}</span>
        </p>
        <p className="mt-1 text-[0.75rem] font-semibold text-ink/60">
          Both players stake {stakeValid ? stakeValue.toLocaleString() : '0'} {currency}.
        </p>
      </div>
    </div>
  );
}

function OpponentStep({
  mode,
  onMode,
  opponent,
  onOpponent,
  note,
  onNote,
  selfAddress,
}: {
  mode: OpponentMode;
  onMode: (mode: OpponentMode) => void;
  opponent: string;
  onOpponent: (value: string) => void;
  note: string;
  onNote: (value: string) => void;
  selfAddress: string | null;
}) {
  const isSelf =
    selfAddress !== null &&
    opponent.replace(/\s+/g, '').toUpperCase() === selfAddress.replace(/\s+/g, '').toUpperCase();
  const showInvalid = mode === 'direct' && opponent.length > 0 && !isNimiqAddressShape(opponent);

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        <ModeOption
          active={mode === 'open'}
          onSelect={() => onMode('open')}
          glyph="🌐"
          title="Open challenge"
          body="Anyone can accept it from the marketplace."
        />
        <ModeOption
          active={mode === 'direct'}
          onSelect={() => onMode('direct')}
          glyph="🎯"
          title="Challenge someone"
          body="Send it straight to one Nimiq address."
        />
      </div>

      {mode === 'direct' && (
        <Sticker tone="panel" className="animate-[var(--animate-pop)]">
          <label htmlFor="opponent" className="eyebrow text-faint">
            Opponent address
          </label>
          <input
            id="opponent"
            value={opponent}
            onChange={(event) => onOpponent(event.target.value)}
            placeholder="NQ.. .. .. .."
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="mt-2 w-full rounded-xl border-2 border-line bg-ink px-3.5 py-3 font-mono text-[0.8125rem] text-text placeholder:text-faint focus:border-lime focus:outline-none"
          />
          {showInvalid && (
            <p className="mt-2 text-[0.75rem] font-semibold text-negative">
              That does not look like a Nimiq address.
            </p>
          )}
          {isSelf && (
            <p className="mt-2 text-[0.75rem] font-semibold text-gold">
              That is your own address — you cannot challenge yourself.
            </p>
          )}
        </Sticker>
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
          className="mt-2 w-full resize-none rounded-xl border-2 border-line bg-ink px-3.5 py-3 text-[0.875rem] text-text placeholder:text-faint focus:border-lime focus:outline-none"
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
  glyph: string;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-[var(--radius-sticker)] border-2 p-4 text-left transition-all duration-150 active:scale-[0.98]',
        active ? 'border-ink bg-cream text-ink shadow-[var(--shadow-sticker)]' : 'border-line bg-panel text-text',
      )}
    >
      <span aria-hidden className="text-[1.5rem] leading-none">
        {glyph}
      </span>
      <span className="flex-1">
        <span className="block text-[0.9375rem] font-black tracking-tight">{title}</span>
        <span className={cn('mt-0.5 block text-[0.75rem] leading-snug', active ? 'text-ink/65' : 'text-faint')}>
          {body}
        </span>
      </span>
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
          active ? 'border-ink bg-ink text-lime' : 'border-line',
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
        className="flex size-24 items-center justify-center rounded-full border-2 border-ink bg-lime text-[2.5rem] shadow-[var(--shadow-sticker)] animate-[var(--animate-pop)]"
      >
        ⚔️
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
