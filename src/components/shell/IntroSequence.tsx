'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { INTRO_VIDEO } from '@/lib/config/env';

const FALLBACK_MS = 2600;
/** If the clip has not started by now, stop waiting and animate instead. */
const VIDEO_START_MS = 1800;
/** Hard ceiling, in case playback begins and then stalls. */
const VIDEO_CEILING_MS = 6000;

/**
 * The intro that plays once a player connects.
 *
 * It prefers the supplied film and falls back to a composited sequence when
 * there is no clip, when the file fails to load, or when playback is refused —
 * mobile autoplay is only permitted for muted inline video, and a WebView can
 * still decline. Either way the app is never left waiting behind it: playback
 * is capped, and a tap skips.
 *
 * Under `prefers-reduced-motion` the animated path collapses to a brief fade.
 */
export function IntroSequence({ handle, onDone }: { handle: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [useVideo, setUseVideo] = useState(Boolean(INTRO_VIDEO));
  const finished = useRef(false);
  const started = useRef(false);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  const beginExit = useCallback(() => {
    setLeaving(true);
    setTimeout(finish, 420);
  }, [finish]);

  // The animated path is on a fixed clock; the video path is driven by the clip
  // itself, with a ceiling so a stall cannot trap the player.
  useEffect(() => {
    if (useVideo) {
      // A clip that has not begun playing quickly is worse than no clip: drop
      // to the animation rather than hold a black screen on a slow connection.
      const startGuard = setTimeout(() => {
        if (!started.current) setUseVideo(false);
      }, VIDEO_START_MS);
      const ceiling = setTimeout(beginExit, VIDEO_CEILING_MS);
      return () => {
        clearTimeout(startGuard);
        clearTimeout(ceiling);
      };
    }
    const total = reduced ? 700 : FALLBACK_MS;
    const exit = setTimeout(beginExit, total - 420);
    return () => clearTimeout(exit);
  }, [beginExit, reduced, useVideo]);

  return (
    <div
      onPointerDown={finish}
      role="presentation"
      className="fixed inset-0 z-50 overflow-hidden bg-[#0b0d10]"
      style={{
        animation: leaving ? 'introExit 0.42s cubic-bezier(0.7,0,0.84,0) forwards' : undefined,
      }}
    >
      {useVideo ? (
        <video
          src={INTRO_VIDEO}
          autoPlay
          muted
          playsInline
          preload="auto"
          className="size-full object-cover"
          onEnded={beginExit}
          // Any failure to load or play drops to the animation rather than a
          // black screen.
          onError={() => setUseVideo(false)}
          onPlaying={() => {
            started.current = true;
          }}
          onCanPlay={(event) => {
            void event.currentTarget.play().catch(() => setUseVideo(false));
          }}
        />
      ) : (
        <div className="relative flex size-full flex-col items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-[42vh] -translate-y-1/2 bg-accent"
            style={{ animation: 'introWipe 0.55s cubic-bezier(0.85,0,0.15,1) both' }}
          />

          <div
            className="relative"
            style={{ animation: 'introLetter 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.35s both' }}
          >
            <Image
              src="/brand/logo-256.png"
              alt="TeTe"
              width={128}
              height={128}
              priority
              className="rounded-[28%]"
            />
          </div>

          <span
            aria-hidden
            className="relative mt-6 h-[3px] w-40 origin-left bg-[#17120e]"
            style={{ animation: 'introRule 0.45s cubic-bezier(0.85,0,0.15,1) 0.9s both' }}
          />

          <p
            className="relative mt-5 text-[0.8125rem] font-bold uppercase tracking-[0.24em] text-[#17120e]/70"
            style={{ animation: 'introFadeUp 0.5s ease-out 1.15s both' }}
          >
            Challenge · Compete · Win
          </p>

          <p
            className="absolute bottom-24 text-[1.125rem] font-black tracking-tight text-white"
            style={{ animation: 'introFadeUp 0.5s ease-out 1.55s both' }}
          >
            Welcome, {handle}
          </p>
        </div>
      )}

      <p className="pointer-events-none absolute inset-x-0 bottom-12 text-center text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-white/45">
        Tap to skip
      </p>
    </div>
  );
}
