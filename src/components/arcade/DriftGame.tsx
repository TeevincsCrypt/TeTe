'use client';

import { useRef } from 'react';

import { GameCanvas, type Frame } from './GameCanvas';
import { drawCar } from './sprites';

interface Slice { y: number; centre: number; half: number }
interface State {
  x: number; vx: number; dist: number; over: boolean; started: boolean;
  road: Slice[]; phase: number; curve: number; scroll: number;
}

const STEP = 12;

/**
 * Drift — one-touch steering. Hold to pull right, release to fall left.
 *
 * An original game in the one-button driving genre. The road is generated as a
 * sine walk whose amplitude and frequency climb with distance, so it stays
 * drivable at the start and genuinely demands anticipation later.
 */
export function DriftGame({ onFinish }: { onFinish: (score: number) => void }) {
  const state = useRef<State>({
    x: 0.5, vx: 0, dist: 0, over: false, started: false, road: [], phase: 0, curve: 0, scroll: 0,
  });
  const done = useRef(false);

  function reset(width: number, height: number) {
    const road: Slice[] = [];
    for (let y = 0; y < height + STEP * 2; y += STEP) {
      road.push({ y, centre: width / 2, half: width * 0.3 });
    }
    state.current = {
      x: width / 2, vx: 0, dist: 0, over: false, started: true,
      road, phase: 0, curve: 0, scroll: 0,
    };
    done.current = false;
  }

  function frame({ ctx, dt, width, height, pointer }: Frame) {
    const s = state.current;
    if (!s.started) reset(width, height);

    if (s.over) {
      if (pointer.pressed && done.current) reset(width, height);
    } else {
      // ---- steering: hold right, release left ---------------------------
      const target = pointer.down ? 165 : -165;
      s.vx += (target - s.vx) * Math.min(1, dt * 7);
      s.x += s.vx * dt;

      const speed = 190 + Math.min(s.dist * 0.05, 190);
      s.dist += speed * dt * 0.06;
      s.scroll += speed * dt;

      // ---- road generation ------------------------------------------------
      while (s.scroll >= STEP) {
        s.scroll -= STEP;
        const head = s.road[0];
        if (!head) break;
        const difficulty = Math.min(s.dist / 260, 1);
        s.phase += 0.055 + difficulty * 0.05;
        const amp = width * (0.10 + difficulty * 0.17);
        const centre = width / 2 + Math.sin(s.phase) * amp + Math.sin(s.phase * 2.3) * amp * 0.3;
        const half = width * (0.30 - difficulty * 0.145);
        s.road.pop();
        s.road.unshift({
          y: 0,
          centre: Math.max(half + 6, Math.min(width - half - 6, centre)),
          half,
        });
        for (let i = 0; i < s.road.length; i += 1) {
          const slice = s.road[i];
          if (slice) slice.y = i * STEP;
        }
      }

      // ---- collision against the slice under the car ---------------------
      const carY = height - 96;
      const index = Math.round(carY / STEP);
      const slice = s.road[index];
      if (slice && Math.abs(s.x - slice.centre) > slice.half - 10) {
        s.over = true;
        if (!done.current) {
          done.current = true;
          onFinish(Math.floor(s.dist));
        }
      }
      if (s.x < 0 || s.x > width) {
        s.over = true;
        if (!done.current) {
          done.current = true;
          onFinish(Math.floor(s.dist));
        }
      }
    }

    // ---- draw -------------------------------------------------------------
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#efe7de';
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    for (const slice of s.road) ctx.lineTo(slice.centre - slice.half, slice.y);
    for (let i = s.road.length - 1; i >= 0; i -= 1) {
      const slice = s.road[i];
      if (slice) ctx.lineTo(slice.centre + slice.half, slice.y);
    }
    ctx.closePath();
    ctx.fillStyle = '#2a211b';
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 16]);
    ctx.beginPath();
    for (const slice of s.road) ctx.lineTo(slice.centre, slice.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const carY = height - 96;
    ctx.save();
    ctx.translate(s.x, carY);
    // The car is drawn nose-up, so rotate a quarter turn out of its side pose.
    ctx.rotate(-Math.PI / 2 + Math.max(-0.4, Math.min(0.4, s.vx / 420)));
    drawCar(ctx, 0, 0, 40, true, s.over ? '#dc2626' : '#ff6a1a');
    ctx.restore();

    ctx.fillStyle = '#17120e';
    ctx.font = '900 34px Archivo, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.floor(s.dist)), 16, 42);

    ctx.font = '700 11px Archivo, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(23,18,14,0.5)';
    ctx.fillText(s.over ? 'TAP TO RESTART' : 'HOLD TO STEER RIGHT · RELEASE FOR LEFT', 16, height - 14);
  }

  return (
    <GameCanvas
      running
      onFrame={frame}
      ariaLabel="Drift game board"
      className="h-[62vh] max-h-[520px] w-full rounded-[1.25rem] bg-[#efe7de]"
    />
  );
}

