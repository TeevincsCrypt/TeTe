import { hashString } from '@/lib/ids';

import { cn } from './cn';

const PALETTES = [
  ['#c8ff4d', '#0a0b0f'],
  ['#8b5cf6', '#f2f1e4'],
  ['#ff6b35', '#0a0b0f'],
  ['#ffc93c', '#0a0b0f'],
  ['#4ade80', '#0a0b0f'],
  ['#f2f1e4', '#0a0b0f'],
] as const;

/**
 * A deterministic geometric avatar derived from the player's real address.
 *
 * Same address, same face, every time — on any device, with no image request
 * and no stored asset. It is generated from real identity rather than being a
 * stand-in for a profile picture TeTe does not have.
 */
export function Avatar({
  address,
  size = 44,
  className,
}: {
  address: string | null;
  size?: number;
  className?: string;
}) {
  const hash = hashString(address ?? 'tete');
  const palette = PALETTES[hash % PALETTES.length] ?? PALETTES[0];
  const [bg, fg] = palette;
  const rotation = hash % 4;
  const variant = (hash >> 3) % 4;

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink',
        className,
      )}
      style={{ width: size, height: size, background: bg }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" width={size} height={size} style={{ transform: `rotate(${rotation * 90}deg)` }}>
        {variant === 0 && <circle cx="14" cy="14" r="13" fill={fg} />}
        {variant === 1 && <path d="M0 40 L40 40 L40 0 Z" fill={fg} />}
        {variant === 2 && (
          <>
            <rect x="0" y="0" width="20" height="20" fill={fg} />
            <rect x="20" y="20" width="20" height="20" fill={fg} />
          </>
        )}
        {variant === 3 && <path d="M20 2 L38 20 L20 38 L2 20 Z" fill={fg} />}
      </svg>
    </span>
  );
}
