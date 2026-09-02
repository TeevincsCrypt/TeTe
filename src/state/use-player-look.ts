'use client';

/**
 * How another player looks, from the directory.
 *
 * A face turns up in lists — challenge rows, an opponent header — so this is
 * cached per address across the whole app and shared between callers. Looking
 * the same person up once per row would mean a request per row, and a photo is
 * not a small payload.
 *
 * Returns nothing until it knows, and nothing at all for a player who has not
 * claimed a name; the `Avatar` fallback (a face generated from the address)
 * covers both without ever showing a placeholder for a real person.
 */
import { useEffect, useState } from 'react';

import { myDirectoryName, type DirectoryPlayer } from '@/lib/api/client';
import { compactAddress } from '@/lib/nimiq/address';

export interface PlayerLook {
  avatarSeed: number | null;
  photo: string | null;
}

const cache = new Map<string, PlayerLook | null>();
const inFlight = new Map<string, Promise<PlayerLook | null>>();
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

/** Drop a cached look, so the next read re-fetches it. */
export function forgetPlayerLook(address: string): void {
  cache.delete(compactAddress(address));
  announce();
}

/** Seed the cache from a lookup a caller already made. */
export function rememberPlayerLook(player: DirectoryPlayer): void {
  cache.set(compactAddress(player.address), {
    avatarSeed: player.avatarSeed ?? null,
    photo: player.photo ?? null,
  });
  announce();
}

async function load(address: string): Promise<PlayerLook | null> {
  const key = compactAddress(address);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    try {
      const player = await myDirectoryName(address);
      const look = player
        ? { avatarSeed: player.avatarSeed ?? null, photo: player.photo ?? null }
        : null;
      cache.set(key, look);
      return look;
    } catch {
      // A directory that is not configured, or a player with no name. Either
      // way the generated avatar is the right answer, so cache the absence
      // rather than asking again on every render.
      cache.set(key, null);
      return null;
    } finally {
      inFlight.delete(key);
      announce();
    }
  })();

  inFlight.set(key, request);
  return request;
}

export function usePlayerLook(address: string | null | undefined): PlayerLook | null {
  const key = address ? compactAddress(address) : null;
  const [, bump] = useState(0);

  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!address || !key || cache.has(key)) return;
    void load(address);
  }, [address, key]);

  return key ? (cache.get(key) ?? null) : null;
}
