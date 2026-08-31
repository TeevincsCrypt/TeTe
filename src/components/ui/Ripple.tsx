'use client';

import { useCallback, useRef, useState } from 'react';

interface Drop {
  id: number;
  x: number;
  y: number;
  size: number;
}

/**
 * Material-style ripple that starts at the exact point pressed.
 *
 * A circle is spawned at the pointer's coordinates inside an overflow-hidden
 * host, scaled from 0 to 2.6 while fading out over ~0.6s, then removed. The
 * diameter is derived from the element's own size so the wave always clears its
 * furthest corner, whatever the button's shape.
 *
 * Returns the ripple layer plus the handler that seeds it, so any element can
 * opt in without inheriting a wrapper.
 */
export function useRipple(color = 'currentColor') {
  const [drops, setDrops] = useState<Drop[]>([]);
  const next = useRef(0);

  const spawn = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const host = event.currentTarget;
    const rect = host.getBoundingClientRect();
    // Reach from the press point to the furthest corner, doubled for the radius.
    const size =
      Math.max(
        Math.hypot(event.clientX - rect.left, event.clientY - rect.top),
        Math.hypot(rect.right - event.clientX, event.clientY - rect.top),
        Math.hypot(event.clientX - rect.left, rect.bottom - event.clientY),
        Math.hypot(rect.right - event.clientX, rect.bottom - event.clientY),
      ) * 2;

    const id = (next.current += 1);
    setDrops((current) => [
      ...current,
      { id, x: event.clientX - rect.left, y: event.clientY - rect.top, size },
    ]);
  }, []);

  const layer = (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      {drops.map((drop) => (
        <span
          key={drop.id}
          onAnimationEnd={() => setDrops((current) => current.filter((d) => d.id !== drop.id))}
          className="absolute rounded-full animate-[var(--animate-ripple)]"
          style={{
            left: drop.x - drop.size / 2,
            top: drop.y - drop.size / 2,
            width: drop.size,
            height: drop.size,
            background: color,
          }}
        />
      ))}
    </span>
  );

  return { layer, spawn };
}
