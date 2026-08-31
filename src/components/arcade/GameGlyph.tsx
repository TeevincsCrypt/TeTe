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
  return (
    <svg {...base} {...props}>
      <path d="M4 20 18 6" />
      <path d="M14 4h6v6" />
      <circle cx="8" cy="15" r="3" />
    </svg>
  );
}
