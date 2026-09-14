'use client';

import { useRef } from 'react';

import { currentCharacter } from '@/lib/arcade/characters';
import {
  CAR_Y_OFFSET,
  createDriftScene,
  disposeDriftScene,
  setCarColor,
  updateDriftScene,
  type DriftScene,
  type Pickup,
  type Slice,
} from '@/lib/arcade/drift3d';
import { sfxCoin, sfxHazard } from '@/lib/arcade/sfx';

import { Game3D, type Frame3D } from './Game3D';

interface State {
  x: number; vx: number; dist: number; over: boolean; started: boolean;
  road: Slice[]; phase: number; curve: number; scroll: number;
  pickups: Pickup[]; coins: number; hazards: number; flash: number; nextDrop: number;
}

const STEP = 12;

/**
 * Drift — one-touch steering. Hold to pull right, release to fall left.
 *
 * The same sine-walk road, one-button steering, pickups, collision and
 * scoring as always — none of that changed, which is what keeps the score and
 * coin counts this reports to the reward ledger identical to before.
 *
 * It now runs on the shared Game3D surface like every other game rather than
 * owning a private canvas and render loop. That private loop was the reason a
 * renderer change could silently blank this one game and nothing else: the
 * render call lived in the scene module purely because Drift expected it to.
 */
export function DriftGame({
  onFinish,
}: {
  onFinish: (score: number, coins: number, hazards: number) => void;
}) {
  // Read synchronously: the scene is built in an effect that runs before the
  // character hook resolves. Kept as the base colour the paint returns to.
  const skin = useRef(currentCharacter());

  const scoreRef = useRef<HTMLDivElement | null>(null);
  const tallyRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);

  const state = useRef<State>({
    x: 0.5, vx: 0, dist: 0, over: false, started: false, road: [], phase: 0, curve: 0, scroll: 0,
    pickups: [], coins: 0, hazards: 0, flash: 0, nextDrop: 0,
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
      pickups: [], coins: 0, hazards: 0, flash: 0, nextDrop: 22,
    };
    done.current = false;
  }

  function frame({ handle, dt, width, height, pointer }: Frame3D<DriftScene>) {
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

      // ---- pickups: drop with the road, collect at the car ---------------
      const carY = height - CAR_Y_OFFSET;
      for (const pickup of s.pickups) pickup.y += speed * dt;
      s.pickups = s.pickups.filter((pickup) => {
        if (Math.abs(pickup.y - carY) < 20 && Math.abs(pickup.x - s.x) < 22) {
          if (pickup.kind === 'coin') { s.coins += 1; sfxCoin(); }
          else { s.hazards += 1; sfxHazard(); }
          s.flash = pickup.kind === 'coin' ? 1 : -1;
          return false;
        }
        return pickup.y < height + 40;
      });

      // Spawn on the road head so a pickup is always reachable in principle,
      // just not always without giving up the safe line.
      if (s.dist >= s.nextDrop) {
        s.nextDrop = s.dist + 16 + Math.random() * 22;
        const head = s.road[0];
        if (head) {
          const coin = Math.random() < 0.6;
          s.pickups.push({
            x: head.centre + (Math.random() * 2 - 1) * Math.max(0, head.half - 24),
            y: 0,
            kind: coin ? 'coin' : 'hazard',
          });
        }
      }

      // ---- collision against the slice under the car ---------------------
      const index = Math.round(carY / STEP);
      const slice = s.road[index];
      if (slice && Math.abs(s.x - slice.centre) > slice.half - 10) {
        s.over = true;
        if (!done.current) {
          done.current = true;
          onFinish(Math.floor(s.dist), s.coins, s.hazards);
        }
      }
      if (s.x < 0 || s.x > width) {
        s.over = true;
        if (!done.current) {
          done.current = true;
          onFinish(Math.floor(s.dist), s.coins, s.hazards);
        }
      }
    }

    s.flash *= Math.max(0, 1 - dt * 2.2);

    setCarColor(handle, skin.current.body, s.over);
    updateDriftScene(handle, s, width, height);

    if (scoreRef.current) scoreRef.current.textContent = String(Math.floor(s.dist));
    if (tallyRef.current) {
      tallyRef.current.textContent = String(s.coins - s.hazards);
      tallyRef.current.style.color = s.flash > 0.05 ? '#4ade80' : s.flash < -0.05 ? '#ff6b6b' : '#ffffff';
    }
    if (hintRef.current) {
      hintRef.current.textContent = s.over ? 'TAP TO RESTART' : 'HOLD TO STEER RIGHT · RELEASE FOR LEFT';
    }
  }

  return (
    <Game3D<DriftScene>
      ariaLabel="Drift game board"
      className="h-[62vh] max-h-[520px] bg-[#cfe0ea]"
      setup={(canvas) => createDriftScene(canvas, skin.current.body)}
      onFrame={frame}
      onDispose={disposeDriftScene}
      hud={
        <>
          <div
            ref={scoreRef}
            className="absolute left-3 top-3 rounded-lg bg-black/25 px-2.5 py-1 text-[1.9rem] font-black leading-none text-white drop-shadow"
            style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
          >
            0
          </div>
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/25 px-2.5 py-1.5">
            <span className="size-3 rounded-full bg-[#f2c14e] shadow-[inset_-1px_-1px_2px_rgba(0,0,0,0.35)]" />
            <div
              ref={tallyRef}
              className="text-[1.3rem] font-black leading-none text-white"
              style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
            >
              0
            </div>
          </div>
          <div
            ref={hintRef}
            className="absolute bottom-3 left-3 rounded-md bg-black/25 px-2 py-1 text-[0.68rem] font-bold tracking-wide text-white/90"
          >
            HOLD TO STEER RIGHT · RELEASE FOR LEFT
          </div>
        </>
      }
    />
  );
}
