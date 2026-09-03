import Image from 'next/image';
import type { ReactNode } from 'react';

/**
 * Cover art for each challenge format.
 *
 * Two kinds, by necessity. CODM, PUBG and Free Fire stay original
 * illustrations: every reference photo offered for these turned out to be a
 * specific character illustration lifted from that game's own promotional
 * art — a copyright the publisher holds on the drawing itself, which taking
 * the logo or wordmark off does not clear — so each mark below evokes the
 * *genre* instead. Chess, Trivia, eFootball and Custom are real photos: each
 * one checked directly and found to be generic — a stock chess set, a
 * marquee sign, a stadium crowd with no players or branding in frame, a
 * plain typographic graphic — nothing tying it to a specific owned work.
 */
const PHOTO: Partial<Record<string, string>> = {
  chess: '/format-art/chess.jpg',
  trivia: '/format-art/trivia.jpg',
  efootball: '/format-art/efootball.jpg',
  custom: '/format-art/custom.jpg',
};

const ART: Record<string, { from: string; to: string; art: ReactNode }> = {
  codm: {
    // Cold steel rather than jungle olive — closer to the tactical grey-blue
    // the real title trades on, without touching its actual mark.
    from: '#3b4750', to: '#0a0e12',
    art: (
      <>
        <circle cx="50" cy="36" r="17" strokeWidth="2.5" opacity="0.9" />
        <path d="M50 14v10M50 48v10M28 36h10M62 36h10" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="50" cy="36" r="3" fill="currentColor" stroke="none" />
        <path d="M18 66h64M26 74h48" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      </>
    ),
  },
  pubg: {
    // Open-sky dusk blue, not desert brown — battle royale's actual mood.
    from: '#2d4f66', to: '#0a141b',
    art: (
      <>
        <path d="M32 16h36l-6 20H38Z" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M50 36v12" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="38" y="48" width="24" height="18" rx="4" strokeWidth="2.5" />
        <path d="M20 74h60" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      </>
    ),
  },
  freefire: {
    // Neon violet, matching the real branding's palette — the name says
    // fire, the actual art has never been orange.
    from: '#402458', to: '#140a1f',
    art: (
      <>
        <path
          d="M50 14c10 12 16 20 16 30a16 16 0 0 1-32 0c0-7 4-11 4-11s1 6 5 6c5 0 7-13 7-25Z"
          strokeWidth="2.5" strokeLinejoin="round"
        />
        <path d="M22 72h56" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      </>
    ),
  },
  efootball: {
    // Blue into magenta — the pitch-green treatment read as generic sports
    // rather than this specific, very colourful franchise.
    from: '#1c3f6e', to: '#2a123f',
    art: (
      <>
        <circle cx="50" cy="38" r="18" strokeWidth="2.5" />
        <path d="m50 26 8 6-3 10h-10l-3-10Z" fill="currentColor" stroke="none" opacity="0.9" />
        <path d="M33 31l6 5M67 31l-6 5M41 53l3 8M59 53l-3 8" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <path d="M20 72h60" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      </>
    ),
  },
  chess: {
    // Near-black, the way a set is actually photographed and lit.
    from: '#241e17', to: '#080706',
    art: (
      <>
        <circle cx="50" cy="22" r="7" strokeWidth="2.5" />
        <path d="M42 32h16l-4 10h-8Z" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M38 44h24l4 14H34Z" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M30 64h40" strokeWidth="2.5" strokeLinecap="round" />
      </>
    ),
  },
  trivia: {
    from: '#2f2748', to: '#100d18',
    art: (
      <>
        <path d="M38 30a12 12 0 1 1 14 12v6" strokeWidth="3" strokeLinecap="round" />
        <circle cx="52" cy="58" r="3.4" fill="currentColor" stroke="none" />
        <path d="M22 72h56" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      </>
    ),
  },
  arcade: {
    from: '#1e3a48', to: '#0b1218',
    art: (
      <>
        <rect x="20" y="28" width="60" height="32" rx="12" strokeWidth="2.5" />
        <path d="M34 38v10M29 43h10" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="63" cy="41" r="3" fill="currentColor" stroke="none" />
        <circle cx="70" cy="48" r="3" fill="currentColor" stroke="none" />
      </>
    ),
  },
  custom: {
    from: '#43301a', to: '#150f08',
    art: <path d="M50 16l8 20 21 2-16 14 5 21-18-11-18 11 5-21-16-14 21-2Z" strokeWidth="2.5" strokeLinejoin="round" />,
  },
};

export function FormatArt({
  id,
  className,
  rounded = 'rounded-2xl',
}: {
  id: string;
  className?: string;
  rounded?: string;
}) {
  const photo = PHOTO[id];
  if (photo) {
    return (
      <span className={`relative block overflow-hidden ${rounded} ${className ?? ''}`}>
        <Image src={photo} alt="" fill sizes="240px" className="object-cover" />
      </span>
    );
  }

  const art = ART[id] ?? ART.custom;
  if (!art) return null;

  return (
    <span className={`relative block overflow-hidden ${rounded} ${className ?? ''}`}>
      <svg viewBox="0 0 100 88" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden>
        <defs>
          <linearGradient id={`fa-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={art.from} />
            <stop offset="100%" stopColor={art.to} />
          </linearGradient>
        </defs>
        <rect width="100" height="88" fill={`url(#fa-${id})`} />
        <g className="text-accent" stroke="currentColor" fill="none">
          {art.art}
        </g>
      </svg>
    </span>
  );
}
