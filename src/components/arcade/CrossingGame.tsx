'use client';

import { useRef } from 'react';

import { GameCanvas, type Frame } from './GameCanvas';
import { drawCar, drawCoin, drawHazard, drawRunner, drawTrain } from './sprites';

const LANE = 46;
const COLS = 7;

interface Car { lane: number; x: number; speed: number; w: number; kind: 'car' | 'train'; body: string }
interface Pickup { lane: number; col: number; kind: 'coin' | 'hazard'; taken: boolean }
interface State {
  row: number; col: number; over: boolean; scroll: number;
  lanes: { kind: 'road' | 'safe'; seed: number }[];
  cars: Car[]; pickups: Pickup[]; coins: number; flash: number;
  hop: number; best: number; started: boolean;
}

/**
 * Crossing — hop forward through moving traffic, one tap at a time.
 *
 * An original game in the road-crossing genre. Difficulty ramps by widening the
 * speed range rather than adding cars, so the board never becomes an unreadable
 * wall and death always feels like a misread rather than a lottery.
 *
 * Coins and hazards sit on the lanes ahead: taking a coin is worth a NIM,
 * clipping a caltrop costs one. That turns the safe column into a real choice
 * rather than the obvious line, since the coin is rarely on it.
 */
export function CrossingGame({ onFinish }: { onFinish: (score: number, coins: number) => void }) {
  const state = useRef<State>({
    row: 0, col: 3, over: false, scroll: 0, lanes: [], cars: [], pickups: [], coins: 0, flash: 0,
    hop: 0, best: 0, started: false,
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
        // A rail lane runs one long train instead of two cars, which changes
        // the timing problem rather than just adding more of the same.
        const rail = index > 6 && Math.random() < 0.22;
        const bodies = ['#ff6a1a', '#6d4aff', '#15803d', '#c2410c', '#2b6cb0'];
        for (let i = 0; i < (rail ? 1 : count); i += 1) {
          s.cars.push({
            lane: index,
            x: Math.random() * COLS * LANE,
            speed: rail ? speed * 1.9 : speed,
            w: rail ? 96 : 40 + Math.random() * 22,
            kind: rail ? 'train' : 'car',
            body: bodies[Math.floor(Math.random() * bodies.length)] ?? '#ff6a1a',
          });
        }
      }

      // Coins and hazards start past the opening safe rows, so the first hop
      // is never a coin toss. A lane carries at most one of either.
      if (index > 1) {
        const roll = Math.random();
        if (roll < 0.34) {
          s.pickups.push({
            lane: index,
            col: Math.floor(Math.random() * COLS),
            kind: roll < 0.22 ? 'coin' : 'hazard',
            taken: false,
          });
        }
      }
    }
  }

  function reset() {
    state.current = {
      row: 0, col: 3, over: false, scroll: 0, lanes: [], cars: [], pickups: [], coins: 0, flash: 0,
      hop: 0, best: state.current.best, started: true,
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

      // Landing square decides the pickup, whichever way the player moved.
      const pickup = s.pickups.find((p) => !p.taken && p.lane === s.row && p.col === s.col);
      if (pickup) {
        pickup.taken = true;
        s.coins += pickup.kind === 'coin' ? 1 : -1;
        s.flash = pickup.kind === 'coin' ? 1 : -1;
      }
    }
    s.flash *= Math.max(0, 1 - dt * 2.2);
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
        if (px > car.x - car.w / 2 - 8 && px < car.x + car.w / 2 + 8) {
          s.over = true;
          if (!done.current) {
            done.current = true;
            onFinish(s.row, s.coins);
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

    // Pickups sit under the traffic, so a car never hides behind a coin.
    for (const pickup of s.pickups) {
      if (pickup.taken) continue;
      const y = baseY - (pickup.lane * LANE - s.scroll) - LANE / 2;
      if (y < -LANE || y > height + LANE) continue;
      const x = ox + pickup.col * LANE + LANE / 2;
      if (pickup.kind === 'coin') drawCoin(ctx, x, y, 13, performance.now() / 260 + pickup.lane);
      else drawHazard(ctx, x, y, 13);
    }

    for (const car of s.cars) {
      const y = baseY - (car.lane * LANE - s.scroll) - LANE / 2;
      if (y < -LANE || y > height + LANE) continue;
      if (car.kind === 'train') drawTrain(ctx, ox + car.x, y, car.w, car.speed > 0);
      else drawCar(ctx, ox + car.x, y, car.w, car.speed > 0, car.body);
    }

    const px = ox + s.col * LANE + LANE / 2;
    const py = baseY - LANE / 2;
    drawRunner(ctx, px, py, 1, s.hop);

    ctx.fillStyle = '#17120e';
    ctx.font = '900 34px Archivo, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(s.row), 16, 42);

    // Coin tally, tinted briefly green or red as one is gained or lost.
    drawCoin(ctx, width - 74, 32, 12);
    ctx.textAlign = 'left';
    ctx.font = '900 24px Archivo, system-ui, sans-serif';
    ctx.fillStyle = s.flash > 0.05 ? '#15803d' : s.flash < -0.05 ? '#b91c1c' : '#17120e';
    ctx.fillText(String(s.coins), width - 56, 41);

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

