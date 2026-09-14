import Image from 'next/image';

import type { GameId } from '@/lib/arcade/games';

import { GameGlyph } from './GameGlyph';

/**
 * Cover art for an arcade game.
 *
 * The games that have key art get it; the rest fall back to their existing
 * glyph on a tinted ground, at the same size and shape, so a line-up that is
 * only partly illustrated still reads as one designed set rather than as a
 * page with holes in it. Adding art for a game is one line here — drop the
 * file in /public/game-art and name it.
 *
 * Each cover carries the game's own title in the artwork, which is why the
 * card that uses this puts its label row underneath rather than over the top.
 */
const COVER: Partial<Record<GameId, string>> = {
  crossing: '/game-art/crossing.jpg',
  drift: '/game-art/drift.jpg',
  slice: '/game-art/slice.jpg',
  rush: '/game-art/rush.jpg',
  pitch: '/game-art/pitch.jpg',
};

/** Ground for the games still waiting on art, so each stays distinguishable. */
const TINT: Record<GameId, [from: string, to: string]> = {
  crossing: ['#1e3a48', '#0b1218'],
  drift: ['#3b4750', '#0a0e12'],
  slice: ['#43301a', '#150f08'],
  invasion: ['#1b2340', '#080b16'],
  rush: ['#1d2433', '#0a0e16'],
  pitch: ['#1c3f2e', '#070f0b'],
  overheat: ['#3a2418', '#120a06'],
  alley: ['#2c2620', '#0d0b08'],
};

export function GameArt({
  id,
  className,
  rounded = 'rounded-2xl',
}: {
  id: GameId;
  className?: string;
  rounded?: string;
}) {
  const cover = COVER[id];

  if (cover) {
    return (
      <span className={`relative block overflow-hidden ${rounded} ${className ?? ''}`}>
        <Image
          src={cover}
          alt=""
          fill
          // One hint for every usage, so a card and a thumbnail resolve to the
          // same srcset entry and the app downloads each cover once.
          sizes="(max-width: 768px) 100vw, 560px"
          className="object-cover"
        />
      </span>
    );
  }

  const [from, to] = TINT[id];
  return (
    <span
      className={`relative flex items-center justify-center overflow-hidden ${rounded} ${className ?? ''}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <GameGlyph id={id} className="size-16 text-accent/80" />
    </span>
  );
}
