'use client';

import { useRef } from 'react';

import {
  COLS,
  createCrossingScene,
  disposeCrossingScene,
  updateCrossingScene,
  type CrossingCar,
  type CrossingLane,
  type CrossingPickup,
  type CrossingScene,
} from '@/lib/arcade/crossing3d';
import { sfxCoin, sfxHazard, sfxJump } from '@/lib/arcade/sfx';
import { useCharacter } from '@/state/use-character';

import { Game3D, Hud, type Frame3D } from './Game3D';

const LANE = 46;

interface State {
  row: number; col: number; over: boolean; scroll: number;
  lanes: CrossingLane[];
  cars: CrossingCar[]; pickups: CrossingPickup[]; coins: number; hazards: number; flash: number;
  hop: number; best: number; started: boolean;
}

/**
 * Crossing — hop forward through moving traffic, one tap at a time.
 *
 * An original game in the road-crossing genre. Difficulty ramps by widening the
 * speed range rather than adding cars, so the board never becomes an unreadable
 * wall and death always feels like a misread rather than a lottery.
 *
 * Coins and hazards sit on the lanes ahead: taking a coin is worth a little
 * NIM, clipping a caltrop costs more than a coin earns. That turns the safe
 * column into a real choice rather than the obvious line, since the coin is
 * rarely on it.
 *
 * The board is real geometry under an angled camera now, but the game is the
 * same grid it always was — rows, columns, and traffic measured in the same
 * units the collision checks use.
 */
export function CrossingGame({
  onFinish,
}: {
  onFinish: (score: number, coins: number, hazards: number) => void;
}) {
  const { character } = useCharacter();
  const skin = useRef({ body: character.body, accent: character.accent });
  skin.current = { body: character.body, accent: character.accent };

  const state = useRef<State>({
    row: 0, col: 3, over: false, scroll: 0, lanes: [], cars: [], pickups: [], coins: 0, hazards: 0, flash: 0,
    hop: 0, best: 0, started: false,
  });
  const done = useRef(false);

  const scoreRef = useRef<HTMLDivElement | null>(null);
  const tallyRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);

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
      row: 0, col: 3, over: false, scroll: 0, lanes: [], cars: [], pickups: [], coins: 0, hazards: 0, flash: 0,
      hop: 0, best: state.current.best, started: true,
    };
    done.current = false;
    ensureLanes(0);
  }

  function frame({ handle, dt, width, pointer }: Frame3D<CrossingScene>) {
    const s = state.current;
    if (!s.started) reset();

    // ---- input: tap the sides to shuffle across, anywhere else to hop -----
    if (pointer.pressed && !s.over) {
      if (pointer.x < width * 0.28) s.col = Math.max(0, s.col - 1);
      else if (pointer.x > width * 0.72) s.col = Math.min(COLS - 1, s.col + 1);
      else {
        s.row += 1;
        s.hop = 1;
        s.best = Math.max(s.best, s.row);
        ensureLanes(s.row);
        sfxJump();
      }

      // Landing square decides the pickup, whichever way the player moved.
      const pickup = s.pickups.find((p) => !p.taken && p.lane === s.row && p.col === s.col);
      if (pickup) {
        pickup.taken = true;
        if (pickup.kind === 'coin') { s.coins += 1; sfxCoin(); }
        else { s.hazards += 1; sfxHazard(); }
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
      const boardW = COLS * LANE;
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
            onFinish(s.row, s.coins, s.hazards);
          }
        }
      }
    }

    updateCrossingScene(handle, s);

    if (scoreRef.current) scoreRef.current.textContent = String(s.row);
    if (tallyRef.current) {
      tallyRef.current.textContent = String(s.coins - s.hazards);
      tallyRef.current.style.color = s.flash > 0.05 ? '#4ade80' : s.flash < -0.05 ? '#ff6b6b' : '#ffffff';
    }
    if (hintRef.current) {
      hintRef.current.textContent = s.over
        ? 'TAP TO RESTART'
        : 'TAP SIDES TO MOVE · TAP MIDDLE TO HOP';
    }
  }

  return (
    <Game3D<CrossingScene>
      ariaLabel="Crossing game board"
      className="h-[62vh] max-h-[520px] bg-[#bfd8e6]"
      setup={(canvas) => createCrossingScene(canvas, skin.current.body, skin.current.accent)}
      onFrame={frame}
      onDispose={disposeCrossingScene}
      hud={
        <Hud
          scoreRef={scoreRef}
          tallyRef={tallyRef}
          hintRef={hintRef}
          hint="TAP SIDES TO MOVE · TAP MIDDLE TO HOP"
        />
      }
    />
  );
}
