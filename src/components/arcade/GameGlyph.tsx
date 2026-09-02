import type { SVGProps } from 'react';

import type { GameId } from '@/lib/arcade/games';

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

/** A drawn mark per game, matching the app's icon construction. */
export function GameGlyph({ id, ...props }: { id: GameId } & SVGProps<SVGSVGElement>) {
  if (id === 'crossing') {
    return (
      <svg {...base} {...props}>
        <path d="M3 8h18M3 16h18" />
        <path d="M7 12h3M14 12h3" />
        <path d="M12 21v-3M12 6V3" />
      </svg>
    );
  }
  if (id === 'drift') {
    return (
      <svg {...base} {...props}>
        <path d="M8 21c0-5 8-5 8-10S9 6 9 3" />
        <circle cx="8" cy="21" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (id === 'invasion') {
    // An invader over a cannon.
    return (
      <svg {...base} {...props}>
        <path d="M8 5v2M16 5v2" />
        <path d="M6 7h12v4a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7Z" />
        <path d="M12 21v-3" />
        <path d="M8 21h8" />
      </svg>
    );
  }
  if (id === 'rush') {
    // Three lanes converging.
    return (
      <svg {...base} {...props}>
        <path d="M4 21 9 3M20 21 15 3M12 21v-5" />
        <path d="M6 13h12" />
      </svg>
    );
  }
  if (id === 'pitch') {
    // A ball on a bending path.
    return (
      <svg {...base} {...props}>
        <path d="M4 20c8 0 12-4 12-9" />
        <circle cx="5" cy="20" r="2" />
        <path d="M12 4h8v5" />
      </svg>
    );
  }
  if (id === 'overheat') {
    // A bike wheel over terrain, with a heat mark.
    return (
      <svg {...base} {...props}>
        <circle cx="7" cy="17" r="3.5" />
        <circle cx="18" cy="17" r="3" />
        <path d="M7 17l4-6h5" />
        <path d="M14 7c1-1 1-2 0-3" />
      </svg>
    );
  }
  if (id === 'alley') {
    // A raised pipe.
    return (
      <svg {...base} {...props}>
        <path d="M5 19 15 6" />
        <path d="M13 4l5 3-2 4" />
        <circle cx="4" cy="20" r="1.6" />
      </svg>
    );
  }
  return (
    <svg {...base} {...props}>
      <path d="M4 20 18 6" />
      <path d="M14 4h6v6" />
      <circle cx="8" cy="15" r="3" />
    </svg>
  );
}
