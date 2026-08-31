/**
 * The icon set.
 *
 * Drawn locally rather than pulled from a package: the app needs a specific,
 * bounded set, and a dependency is weight the WebView pays for on every open.
 *
 * All glyphs share one construction — a 24px box, 1.75 stroke, round caps — so
 * they read as one family rather than a pile of clip art. Nothing here is an
 * emoji: emoji render differently on every platform, ignore currentColor, and
 * carry a cartoon tone that fights the rest of the type.
 */
import type { ReactElement, ReactNode, SVGProps } from 'react';

type Icon = (props: SVGProps<SVGSVGElement>) => ReactElement;

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const make = (path: ReactNode): Icon =>
  function Glyph(props: SVGProps<SVGSVGElement>) {
    return (
      <svg {...base} {...props}>
        {path}
      </svg>
    );
  };

/* -------------------------------------------------------------- navigation */

export const HomeIcon = make(
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
  </>,
);

export const SwordsIcon = make(
  <>
    <path d="M14.5 3H21v6.5L10 20.5l-6.5-6.5Z" />
    <path d="m3.5 3 4 4" />
    <path d="m16.5 16.5 4 4" />
  </>,
);

export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);

export const ArcadeIcon = make(
  <>
    <rect x="2.5" y="7" width="19" height="11" rx="4" />
    <path d="M7 11v3M5.5 12.5h3" />
    <circle cx="16" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="18.6" cy="14.6" r="1.1" fill="currentColor" stroke="none" />
  </>,
);

export const UserIcon = make(
  <>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </>,
);

/* ------------------------------------------------------------------ chrome */

export const ChevronLeftIcon = make(<path d="m15 5-7 7 7 7" />);
export const ChevronRightIcon = make(<path d="m9 5 7 7-7 7" />);
export const CheckIcon = make(<path d="m4 12 5.5 5.5L20 7" />);
export const CloseIcon = make(<path d="M6 6l12 12M18 6 6 18" />);

export const RefreshIcon = make(
  <>
    <path d="M20 11a8 8 0 0 0-13.7-5.3L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 13.7 5.3L20 16" />
    <path d="M20 20v-4h-4" />
  </>,
);

export const TrashIcon = make(<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />);

/* ------------------------------------------------------------------ status */

export const TrophyIcon = make(
  <>
    <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
    <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
    <path d="M12 14v3M9 20h6" />
  </>,
);

export const CrownIcon = make(<path d="M3 8l3.5 3L12 5l5.5 6L21 8l-1.5 10h-15Z" />);

export const TargetIcon = make(
  <>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.5" />
  </>,
);

export const FlameIcon = make(
  <path d="M12 3s5 4.2 5 8.4a5 5 0 0 1-10 0C7 9 9 8 9 8s.4 2 1.6 2C12 10 12 6.5 12 3Z" />,
);

export const StarIcon = make(
  <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8Z" />,
);

export const BoltIcon = make(<path d="M13.5 3 5 13.5h5.5L10 21l8.5-10.5H13Z" />);

export const FlagIcon = make(
  <>
    <path d="M6 21V4" />
    <path d="M6 5h11l-2 3.5L17 12H6" />
  </>,
);

export const NoteIcon = make(
  <>
    <path d="M6 3h9l4 4v14H6Z" />
    <path d="M14 3v5h5M9 13h7M9 17h5" />
  </>,
);

export const GlobeIcon = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 3 2.5 14 0 17M12 3.5c-2.5 3-2.5 14 0 17" />
  </>,
);

export const ScalesIcon = make(
  <>
    <path d="M12 4v16M7 20h10M5 8h14l-3 5H8Z" />
    <path d="M12 8 5 6M12 8l7-2" />
  </>,
);

export const HandshakeIcon = make(
  <path d="M3 11l4-4 4 3 2-1 3 2 5-3v7l-4 4-3-3-3 2-4-3H3Z" />,
);

export const WrenchIcon = make(
  <path d="M20 5.5a4.5 4.5 0 0 1-6 5.8L6 19a2.1 2.1 0 0 1-3-3l7.7-8A4.5 4.5 0 0 1 16.5 3l-2.8 2.8 2.5 2.5L19 5.5Z" />,
);

export const PhoneIcon = make(
  <>
    <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
    <path d="M11 18.5h2" />
  </>,
);

export const WalletIcon = make(
  <>
    <path d="M3 8a2 2 0 0 1 2-2h13v3" />
    <path d="M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H5" />
    <circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
  </>,
);

export const PlayIcon = make(<path d="M8 5.5v13l11-6.5Z" />);
