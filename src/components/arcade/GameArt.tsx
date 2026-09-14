import Image from 'next/image';

import type { GameId } from '@/lib/arcade/games';

/**
 * Cover art for an arcade game.
 *
 * Every game has key art, and this map is a complete `Record<GameId, …>` on
 * purpose: adding a game to GAMES without giving it a cover is then a
 * typecheck failure rather than a hole that only shows up on the page. That
 * is the whole reason the earlier glyph fallback is gone — it existed to
 * cover a gap that no longer exists, and keeping it would have quietly
 * absorbed exactly the mistake this now catches.
 *
 * Each cover carries the game's own title in the artwork, which is why the
 * card that uses this puts its label row underneath rather than over the top.
 */
const COVER: Record<GameId, string> = {
  crossing: '/game-art/crossing.jpg',
  drift: '/game-art/drift.jpg',
  slice: '/game-art/slice.jpg',
  invasion: '/game-art/invasion.jpg',
  rush: '/game-art/rush.jpg',
  pitch: '/game-art/pitch.jpg',
  overheat: '/game-art/overheat.jpg',
  alley: '/game-art/alley.jpg',
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
  return (
    <span className={`relative block overflow-hidden ${rounded} ${className ?? ''}`}>
      <Image
        src={COVER[id]}
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
