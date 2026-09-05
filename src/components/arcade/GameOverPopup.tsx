'use client';

import { useEffect, useState } from 'react';

import { CrownIcon } from '@/components/shell/icons';
import { sfxHighScore, sfxLose } from '@/lib/arcade/sfx';

/**
 * The beat right as a round ends, before the score/reward detail underneath
 * it (`ResultBar`) is worth reading. Self-contained on purpose: mounting it
 * plays the right sound exactly once, and dismissing it just unmounts it —
 * nothing here touches the reward-claim flow that already runs independently
 * beneath it. Give it a fresh `key` per round (the arcade page keys it on
 * `result.at`) so a new round always opens it again.
 */
export function GameOverPopup({
  record,
  score,
  unit,
}: {
  record: boolean;
  score: number;
  unit: string;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (record) sfxHighScore();
    else sfxLose();
    // Played once, for the round this popup was created for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setOpen(false);
      }}
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-[var(--animate-rise)]"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="mx-6 w-full max-w-[16rem] rounded-[1.5rem] bg-panel px-6 py-7 text-center shadow-2xl"
      >
        {record ? (
          <>
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-on-accent">
              <CrownIcon className="size-7" />
            </span>
            <p className="mt-4 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-accent-text">
              New best
            </p>
            <h2 className="display mt-1 text-[1.625rem] leading-[0.95]">New High Score!</h2>
          </>
        ) : (
          <h2 className="display text-[1.75rem] leading-[0.95] text-negative">You Lose</h2>
        )}

        <p className="mt-3 text-[2rem] font-black leading-none tracking-[-0.03em] tabular">
          {score}
          <span className="ml-1 text-[0.9375rem] font-bold text-faint">{unit}</span>
        </p>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-6 min-h-11 w-full rounded-full bg-accent text-[0.875rem] font-bold text-on-accent transition-transform duration-100 active:scale-[0.97]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
