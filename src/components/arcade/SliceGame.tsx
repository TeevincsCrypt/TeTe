'use client';

import { useRef } from 'react';

import {
  createSliceScene,
  disposeSliceScene,
  updateSliceScene,
  type FruitKind,
  type SliceScene,
  type SliceTarget,
  type SliceTrailPoint,
} from '@/lib/arcade/slice3d';
import { sfxHazard, sfxHit } from '@/lib/arcade/sfx';

import { Game3D, type Frame3D } from './Game3D';

interface Target extends SliceTarget {
  vx: number; vy: number; spin: number;
}
interface State {
  targets: Target[]; trail: SliceTrailPoint[]; score: number; lives: number;
  over: boolean; started: boolean; spawn: number; elapsed: number; combo: number; comboAt: number;
}

const FRUITS: FruitKind[] = ['melon', 'orange', 'apple', 'lime', 'plum', 'banana'];

/**
 * Slice — swipe through the targets, leave the black ones alone.
 *
 * An original game in the swipe-to-slice genre. Targets fly on real gravity
 * arcs; a swipe cuts anything its segment crosses this frame, so fast diagonal
 * strokes chain combos. Hitting a black target costs a life, which is what
 * stops flailing being the optimal strategy.
 *
 * The arcs and the segment-against-circle test are unchanged. What the 3D
 * brings is that a cut fruit actually comes apart — each one is two
 * hemispheres that separate on the frame it is hit.
 */
export function SliceGame({ onFinish }: { onFinish: (score: number) => void }) {
  const state = useRef<State>({
    targets: [], trail: [], score: 0, lives: 3, over: false,
    started: false, spawn: 0, elapsed: 0, combo: 0, comboAt: 0,
  });
  const done = useRef(false);

  const scoreRef = useRef<HTMLDivElement | null>(null);
  const comboRef = useRef<HTMLDivElement | null>(null);
  const livesRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);

  function reset() {
    state.current = {
      targets: [], trail: [], score: 0, lives: 3, over: false,
      started: true, spawn: 0, elapsed: 0, combo: 0, comboAt: 0,
    };
    done.current = false;
  }

  function frame({ handle, dt, width, height, pointer }: Frame3D<SliceScene>) {
    const s = state.current;
    if (!s.started) reset();

    if (s.over) {
      if (pointer.pressed && done.current) reset();
    } else {
      s.elapsed += dt;
      s.spawn -= dt;

      if (s.spawn <= 0) {
        // Throw rate and bomb share both climb with time.
        s.spawn = Math.max(0.42, 1.15 - s.elapsed * 0.02);
        const count = 1 + (Math.random() < Math.min(0.45, s.elapsed / 55) ? 1 : 0);
        for (let i = 0; i < count; i += 1) {
          const bomb = Math.random() < Math.min(0.22, 0.05 + s.elapsed / 320);
          s.targets.push({
            x: width * (0.15 + Math.random() * 0.7),
            y: height + 40,
            vx: (Math.random() - 0.5) * 130,
            vy: -(560 + Math.random() * 150),
            r: 25 + Math.random() * 9,
            spin: (Math.random() - 0.5) * 5,
            angle: 0,
            hit: false,
            bomb,
            fruit: FRUITS[Math.floor(Math.random() * FRUITS.length)] ?? 'orange',
          });
        }
      }

      // ---- swipe segment for this frame ---------------------------------
      const swiping = pointer.down && (Math.abs(pointer.dx) + Math.abs(pointer.dy)) > 2;
      const from = { x: pointer.x - pointer.dx, y: pointer.y - pointer.dy };
      if (swiping) s.trail.push({ x: pointer.x, y: pointer.y, life: 1 });

      for (const t of s.targets) {
        t.vy += 1250 * dt;
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        t.angle += t.spin * dt;

        if (!t.hit && swiping && segmentHitsCircle(from, pointer, t.x, t.y, t.r)) {
          t.hit = true;
          if (t.bomb) {
            s.lives -= 1;
            s.combo = 0;
            sfxHazard();
          } else {
            s.combo = s.elapsed - s.comboAt < 0.55 ? s.combo + 1 : 1;
            s.comboAt = s.elapsed;
            s.score += s.combo;
            sfxHit();
          }
        }
      }

      // A miss only costs a life for a real target, never a bomb.
      s.targets = s.targets.filter((t) => {
        if (t.y - t.r > height + 60) {
          if (!t.hit && !t.bomb) { s.lives -= 1; sfxHazard(); }
          return false;
        }
        return !(t.hit && t.y > height + 60);
      });

      for (const p of s.trail) p.life -= dt * 3.4;
      s.trail = s.trail.filter((p) => p.life > 0);

      if (s.lives <= 0) {
        s.over = true;
        if (!done.current) {
          done.current = true;
          onFinish(s.score);
        }
      }
    }

    updateSliceScene(handle, s, width, height);

    if (scoreRef.current) scoreRef.current.textContent = String(s.score);
    if (comboRef.current) {
      const show = s.combo > 1 && !s.over;
      comboRef.current.style.opacity = show ? '1' : '0';
      if (show) comboRef.current.textContent = `${s.combo}x`;
    }
    if (livesRef.current) {
      const pips = livesRef.current.children;
      for (let i = 0; i < pips.length; i += 1) {
        (pips[i] as HTMLElement).style.opacity = i < s.lives ? '1' : '0.18';
      }
    }
    if (hintRef.current) {
      hintRef.current.textContent = s.over
        ? 'TAP TO RESTART'
        : 'SWIPE TO SLICE · AVOID THE BOMBS';
    }
  }

  return (
    <Game3D<SliceScene>
      ariaLabel="Slice game board"
      className="h-[62vh] max-h-[520px] bg-[#efe7de]"
      setup={(canvas) => createSliceScene(canvas)}
      onFrame={frame}
      onDispose={disposeSliceScene}
      hud={
        <>
          <div className="absolute left-3 top-3">
            <div
              ref={scoreRef}
              className="text-[1.9rem] font-black leading-none text-[#17120e]"
              style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
            >
              0
            </div>
            <div
              ref={comboRef}
              className="mt-1 text-[0.9rem] font-black leading-none text-[#ff6a1a] opacity-0 transition-opacity"
              style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
            />
          </div>

          <div ref={livesRef} className="absolute right-3 top-3 flex gap-1.5">
            <span className="size-3.5 rounded-full bg-[#cc3118]" />
            <span className="size-3.5 rounded-full bg-[#cc3118]" />
            <span className="size-3.5 rounded-full bg-[#cc3118]" />
          </div>

          <div
            ref={hintRef}
            className="absolute bottom-3 left-3 text-[0.68rem] font-bold tracking-wide text-[#17120e]/55"
          >
            SWIPE TO SLICE · AVOID THE BOMBS
          </div>
        </>
      }
    />
  );
}

/** Does the swipe segment this frame pass through the target's circle? */
function segmentHitsCircle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cx: number, cy: number, r: number,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(a.x - cx, a.y - cy) <= r;
  let t = ((cx - a.x) * dx + (cy - a.y) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + t * dx - cx, a.y + t * dy - cy) <= r;
}
