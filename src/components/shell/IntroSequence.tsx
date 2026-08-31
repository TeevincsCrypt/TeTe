'use client';

import { useEffect, useRef, useState } from 'react';

import { INTRO_VIDEO } from '@/lib/config/env';

const DURATION = 2600;
const WORD = ['T', 'e', 'T', 'e'];

/**
 * The intro that plays once a player connects.
 *
 * It is a scripted motion sequence rather than a bundled film: shipping an
 * actual video would mean shipping megabytes into a WebView on a phone
 * connection, and there is no source footage in this repository to ship. Every
 * frame here is composited from type and colour, weighs nothing, and stays
 * crisp at any density.
 *
 * If real footage is wanted, set `NEXT_PUBLIC_INTRO_VIDEO` to its URL and this
 * plays that instead, with the same timing and skip behaviour.
 *
 * It is skippable on tap, plays once per session, and collapses to a brief fade
 * when the player has asked for reduced motion.
 */
export function IntroSequence({ handle, onDone }: { handle: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const total = reduced ? 700 : DURATION;
    const exit = setTimeout(() => setLeaving(true), total - 420);
    const end = setTimeout(() => {
      if (!finished.current) {
        finished.current = true;
        onDone();
      }
    }, total);
    return () => {
      clearTimeout(exit);
      clearTimeout(end);
    };
  }, [onDone, reduced]);

  function skip() {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }

  return (
    <div
      onPointerDown={skip}
      role="presentation"
      className="fixed inset-0 z-50 overflow-hidden bg-contrast"
      style={{
        animation: leaving ? 'introExit 0.42s cubic-bezier(0.7,0,0.84,0) forwards' : undefined,
      }}
    >
      {INTRO_VIDEO ? (
        <video
          src={INTRO_VIDEO}
          autoPlay
          muted
          playsInline
          className="size-full object-cover"
          onEnded={skip}
        />
      ) : (
        <div className="relative flex size-full flex-col items-center justify-center">
          {/* Orange sweep that establishes the field before the mark lands. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-[42vh] -translate-y-1/2 bg-accent"
            style={{ animation: 'introWipe 0.55s cubic-bezier(0.85,0,0.15,1) both' }}
          />

          <div className="relative flex items-baseline">
            {WORD.map((letter, index) => (
              <span
                key={`${letter}-${index}`}
                className="text-[4.5rem] font-black leading-none tracking-[-0.045em] text-on-accent"
                style={{
                  animation: `introLetter 0.5s cubic-bezier(0.34,1.56,0.64,1) ${0.42 + index * 0.075}s both`,
                }}
              >
                {letter}
              </span>
            ))}
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="absolute -right-8 -top-4 size-7 text-on-accent"
              style={{ animation: 'introSpark 0.7s ease-out 0.85s both' }}
            >
              <path
                d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <span
            aria-hidden
            className="relative mt-5 h-[3px] w-40 origin-left bg-contrast"
            style={{ animation: 'introRule 0.45s cubic-bezier(0.85,0,0.15,1) 0.9s both' }}
          />

          <p
            className="relative mt-5 text-[0.8125rem] font-bold uppercase tracking-[0.24em] text-on-accent/70"
            style={{ animation: 'introFadeUp 0.5s ease-out 1.15s both' }}
          >
            Challenge · Compete · Win
          </p>

          <p
            className="absolute bottom-24 text-[1.125rem] font-black tracking-tight text-on-contrast"
            style={{ animation: 'introFadeUp 0.5s ease-out 1.55s both' }}
          >
            Welcome, {handle}
          </p>

          <p className="absolute bottom-12 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-on-contrast/35">
            Tap to skip
          </p>
        </div>
      )}
    </div>
  );
}
