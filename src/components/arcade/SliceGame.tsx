'use client';

import { useRef } from 'react';

import { GameCanvas, type Frame } from './GameCanvas';
import { drawBomb, drawFruit, type FruitKind } from './sprites';

interface Target {
  x: number; y: number; vx: number; vy: number; r: number;
  spin: number; angle: number; hit: boolean; bomb: boolean; fruit: FruitKind;
}
interface Trail { x: number; y: number; life: number }
interface State {
  targets: Target[]; trail: Trail[]; score: number; lives: number;
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
 */
export function SliceGame({ onFinish }: { onFinish: (score: number) => void }) {
  const state = useRef<State>({
    targets: [], trail: [], score: 0, lives: 3, over: false,
    started: false, spawn: 0, elapsed: 0, combo: 0, comboAt: 0,
  });
  const done = useRef(false);

  function reset() {
    state.current = {
      targets: [], trail: [], score: 0, lives: 3, over: false,
      started: true, spawn: 0, elapsed: 0, combo: 0, comboAt: 0,
    };
    done.current = false;
  }

  function frame({ ctx, dt, width, height, pointer }: Frame) {
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
          } else {
            s.combo = s.elapsed - s.comboAt < 0.55 ? s.combo + 1 : 1;
            s.comboAt = s.elapsed;
            s.score += s.combo;
          }
        }
      }

      // A miss only costs a life for a real target, never a bomb.
      s.targets = s.targets.filter((t) => {
        if (t.y - t.r > height + 60) {
          if (!t.hit && !t.bomb) s.lives -= 1;
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

    // ---- draw -------------------------------------------------------------
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#efe7de';
    ctx.fillRect(0, 0, width, height);

    for (const t of s.targets) {
      if (t.bomb) drawBomb(ctx, t.x, t.y, t.r, t.angle, t.hit);
      else drawFruit(ctx, t.fruit, t.x, t.y, t.r, t.angle, t.hit);
    }

    ctx.lineCap = 'round';
    for (let i = 1; i < s.trail.length; i += 1) {
      const a = s.trail[i - 1];
      const b = s.trail[i];
      if (!a || !b) continue;
      ctx.globalAlpha = Math.max(0, b.life) * 0.85;
      ctx.strokeStyle = '#17120e';
      ctx.lineWidth = 5 * b.life;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#17120e';
    ctx.font = '900 34px Archivo, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(s.score), 16, 42);

    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(width - 22 - i * 22, 32, 7, 0, Math.PI * 2);
      ctx.fillStyle = i < s.lives ? '#cc3118' : 'rgba(23,18,14,0.16)';
      ctx.fill();
    }

    if (s.combo > 1 && !s.over) {
      ctx.font = '900 15px Archivo, system-ui, sans-serif';
      ctx.fillStyle = '#ff6a1a';
      ctx.fillText(`${s.combo}x`, 16, 66);
    }

    ctx.font = '700 11px Archivo, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(23,18,14,0.5)';
    ctx.fillText(s.over ? 'TAP TO RESTART' : 'SWIPE TO SLICE · AVOID THE BOMBS', 16, height - 14);
  }

  return (
    <GameCanvas
      running
      onFrame={frame}
      ariaLabel="Slice game board"
      className="h-[62vh] max-h-[520px] w-full rounded-[1.25rem] bg-[#efe7de]"
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
