'use client';

import { Avatar } from '@/components/ui/Avatar';
import { usePlayerLook } from '@/state/use-player-look';

/**
 * Another player's face, as they chose it.
 *
 * `Avatar` on its own only knows how to generate a face from an address, which
 * is right for somebody with no profile and wrong for somebody who has set
 * one — tag them and you would get a default that looks nothing like the
 * picture they picked. This looks their choice up and falls back to the
 * generated face when there is nothing to find.
 */
export function PlayerFace({
  address,
  size = 40,
  className,
}: {
  address: string | null;
  size?: number;
  className?: string;
}) {
  const look = usePlayerLook(address);
  return (
    <Avatar
      address={address}
      size={size}
      className={className}
      seed={look?.avatarSeed ?? null}
      photo={look?.photo ?? null}
    />
  );
}
