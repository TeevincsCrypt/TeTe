'use client';

import { useRef } from 'react';

import { GameCanvas, type Frame } from './GameCanvas';

const LANE = 46;
const COLS = 7;

interface Car { lane: number; x: number; speed: number; w: number }
interface State {
  row: number; col: number; over: boolean; scroll: number;
  lanes: { kind: 'road' | 'safe'; seed: number }[];
  cars: Car[]; hop: number; best: number; started: boolean;
}

/**
 * Crossing — hop forward through moving traffic, one tap at a time.
 *
 * An original game in the road-crossing genre. Difficulty ramps by widening the
 * speed range rather than adding cars, so the board never becomes an unreadable
 * wall and death always feels like a misread rather than a lottery.
 */
export function CrossingGame({ onFinish }: { onFinish: (score: number) => void }) {
  const state = useRef<State>({
    row: 0, col: 3, over: false, scroll: 0, lanes: [], cars: [], hop: 0, best: 0, started: false,
  });
  const done = useRef(false);

  function ensureLanes(upTo: number) {
    const s = state.current;
    while (s.lanes.length <= upTo + 12) {
      const index = s.lanes.length;
      const kind: 'road' | 'safe' = index < 2 ? 'safe' : Math.random() < 0.62 ? 'road' : 'safe';
      s.lanes.push({ kind, seed: Math.random() });
      if (kind === 'road') {
        const dir = Math.random() < 0.5 ? 1 : -1;
        // Speed scales with depth, so the ramp is gradual and legible.
        const speed = (46 + Math.random() * 42 + index * 1.4) * dir;
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i += 1) {
          s.cars.push({
            lane: index,
            x: Math.random() * COLS * LANE,
            speed,
            w: 34 + Math.random() * 22,
          });
        }
      }
    }
  }

  function reset() {
    state.current = {
      row: 0, col: 3, over: false, scroll: 0, lanes: [], cars: [], hop: 0,
      best: state.current.best, started: true,
    };
    done.current = false;
    ensureLanes(0);
  }

  function frame({ ctx, dt, width, height, pointer }: Frame) {
    const s = state.current;
    if (!s.started) reset();

    const boardW = COLS * LANE;
    const ox = (width - boardW) / 2;
    const baseY = height - 110;

    // ---- input: tap the sides to shuffle across, anywhere else to hop -----
    if (pointer.pressed && !s.over) {
      const rel = pointer.x - ox;
      if (rel < boardW * 0.28) s.col = Math.max(0, s.col - 1);
      else if (rel > boardW * 0.72) s.col = Math.min(COLS - 1, s.col + 1);
      else {
        s.row += 1;
        s.hop = 1;
        s.best = Math.max(s.best, s.row);
        ensureLanes(s.row);
      }
    }
    if (pointer.pressed && s.over && done.current) {
      reset();
      return;
    }

    s.hop = Math.max(0, s.hop - dt * 6);
    const targetScroll = s.row * LANE;
    s.scroll += (targetScroll - s.scroll) * Math.min(1, dt * 9);

    // ---- traffic ----------------------------------------------------------
    if (!s.over) {
      for (const car of s.cars) {
        car.x += car.speed * dt;
        if (car.speed > 0 && car.x > boardW + 60) car.x = -60;
        if (car.speed < 0 && car.x < -60) car.x = boardW + 60;
      }

      const px = s.col * LANE + LANE / 2;
      for (const car of s.cars) {
        if (car.lane !== s.row) continue;
        if (px > car.x - car.w / 2 - 9 && px < car.x + car.w / 2 + 9) {
          s.over = true;
          if (!done.current) {
            done.current = true;
            onFinish(s.row);
          }
        }
      }
    }

    // ---- draw -------------------------------------------------------------
    ctx.clearRect(0, 0, width, height);

    for (let i = Math.max(0, s.row - 3); i < s.row + 10; i += 1) {
      const lane = s.lanes[i];
      if (!lane) continue;
      const y = baseY - (i * LANE - s.scroll);
      if (y < -LANE || y > height + LANE) continue;

      ctx.fillStyle = lane.kind === 'road' ? '#2a211b' : i % 2 ? '#efe7de' : '#e7ded3';
      ctx.fillRect(ox, y - LANE, boardW, LANE);

      if (lane.kind === 'road') {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 12]);
        ctx.beginPath();
        ctx.moveTo(ox, y - LANE / 2);
        ctx.lineTo(ox + boardW, y - LANE / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    for (const car of s.cars) {
      const y = baseY - (car.lane * LANE - s.scroll) - LANE / 2;
      if (y < -LANE || y > height + LANE) continue;
      ctx.fillStyle = car.speed > 0 ? '#ff6a1a' : '#6d4aff';
      roundRect(ctx, ox + car.x - car.w / 2, y - 11, car.w, 22, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      roundRect(ctx, ox + car.x - car.w / 2 + 6, y - 6, car.w - 12, 5, 2);
      ctx.fill();
    }

    const px = ox + s.col * LANE + LANE / 2;
    const py = baseY - LANE / 2 - s.hop * 12;
    ctx.fillStyle = s.over ? '#dc2626' : '#17120e';
    roundRect(ctx, px - 13, py - 13, 26, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#ff6a1a';
    roundRect(ctx, px - 6, py - 7, 12, 6, 2);
    ctx.fill();

    ctx.fillStyle = '#17120e';
    ctx.font = '900 34px Archivo, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(s.row), 16, 42);

    ctx.font = '700 11px Archivo, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(23,18,14,0.5)';
    ctx.fillText(s.over ? 'TAP TO RESTART' : 'TAP SIDES TO MOVE · TAP MIDDLE TO HOP', 16, height - 14);
  }

  return (
    <GameCanvas
      running
      onFrame={frame}
      ariaLabel="Crossing game board"
      className="h-[62vh] max-h-[520px] w-full rounded-[1.25rem] bg-[#f6f0e8]"
    />
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
