'use client';

import { useRef } from 'react';

import {
  createOverheatScene,
  disposeOverheatScene,
  slopeAt,
  terrainAt,
  updateOverheatScene,
  type OverheatPickup,
  type OverheatScene,
} from '@/lib/arcade/overheat3d';
import { currentCharacter } from '@/lib/arcade/characters';
import { sfxCoin, sfxHazard } from '@/lib/arcade/sfx';

import { Game3D, type Frame3D } from './Game3D';

interface State {
  started: boolean; over: boolean;
  /** Distance travelled, in metres. */
  x: number; speed: number;
  /** Height above the terrain, and vertical velocity. */
  y: number; vy: number; airborne: boolean;
  /** Bike pitch in radians, and how fast it is rotating. */
  angle: number; spin: number;
  heat: number; stalled: number;
  wheel: number; pickups: OverheatPickup[]; nextPickup: number;
  coins: number; hazards: number; flash: number;
  crashed: number; message: string; messageAt: number;
}

const START: Omit<State, 'started'> = {
  over: false, x: 0, speed: 9, y: 0, vy: 0, airborne: false,
  angle: 0, spin: 0, heat: 0, stalled: 0, wheel: 0,
  pickups: [], nextPickup: 30, coins: 0, hazards: 0, flash: 0,
  crashed: 0, message: '', messageAt: 0,
};

/**
 * Overheat — a dirt bike ride over rolling terrain.
 *
 * An original game in the physics trials genre, built on that genre's two
 * demands. The first is engine temperature: holding the throttle is always
 * faster and always heats the engine, and letting it boil over stalls you into
 * a crawl while it cools, so the run is a series of decisions about when to
 * back off. The second is landing balance: coming off a crest sends the bike
 * into the air, and it has to meet the ground at roughly the slope's angle or
 * it goes down.
 *
 * Lean is controlled by where a finger sits while airborne — left half rotates
 * the nose up, right half drops it — which is enough to level a landing with
 * one thumb.
 *
 * The terrain is real geometry now, extruded from the same height function the
 * physics reads, so the slope a player judges a landing against is exactly the
 * slope the landing is checked against.
 */
export function OverheatGame({
  onFinish,
}: {
  onFinish: (score: number, coins: number, hazards: number) => void;
}) {
  // The whole character is a Look, so the scene gets gear and build as well as
  // colour. Read synchronously: this figure's geometry is assembled once when
  // the scene is built, which happens before the character hook's effect runs.
  const skin = useRef(currentCharacter());

  const state = useRef<State>({ ...START, started: false });
  const done = useRef(false);

  const scoreRef = useRef<HTMLDivElement | null>(null);
  const tallyRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const heatRef = useRef<HTMLDivElement | null>(null);
  const messageRef = useRef<HTMLDivElement | null>(null);

  function reset() {
    state.current = { ...START, started: true, pickups: [] };
    done.current = false;
  }

  function finish() {
    const s = state.current;
    s.over = true;
    if (!done.current) {
      done.current = true;
      onFinish(Math.floor(s.x), s.coins, s.hazards);
    }
  }

  function frame({ handle, dt, width, pointer }: Frame3D<OverheatScene>) {
    const s = state.current;
    if (!s.started) reset();

    if (pointer.pressed && s.over && done.current) {
      reset();
      return;
    }

    if (!s.over) {
      const throttle = pointer.down && s.stalled <= 0;

      // ---- engine heat -----------------------------------------------------
      if (throttle) {
        s.heat = Math.min(1.25, s.heat + dt * 0.34);
        s.speed = Math.min(30, s.speed + dt * 7);
      } else {
        s.heat = Math.max(0, s.heat - dt * 0.42);
        s.speed = Math.max(6, s.speed - dt * 3.4);
      }
      if (s.heat >= 1 && s.stalled <= 0) {
        // Boiled over: the engine cuts out and has to cool before it restarts.
        s.stalled = 1.6;
        s.message = 'OVERHEATED';
        s.messageAt = performance.now();
      }
      if (s.stalled > 0) {
        s.stalled -= dt;
        s.speed = Math.max(3, s.speed - dt * 9);
        s.heat = Math.max(0, s.heat - dt * 0.75);
      }

      s.x += s.speed * dt;
      s.wheel += s.speed * dt * 0.9;

      // ---- terrain and flight ----------------------------------------------
      const terrain = terrainAt(s.x);
      const under = slopeAt(s.x);

      if (!s.airborne) {
        s.y = terrain;
        s.angle += (under - s.angle) * Math.min(1, dt * 14);
        // A crest steeper than the bike can follow launches it.
        const ahead = slopeAt(s.x + 1.6);
        if (ahead < under - 0.2 && s.speed > 13) {
          s.airborne = true;
          s.vy = s.speed * 2.2 * Math.max(0.3, -Math.sin(under));
          s.spin = 0;
        }
      } else {
        s.vy -= 62 * dt;
        s.y += s.vy * dt;

        // Lean: finger on the left pulls the nose up, right pushes it down.
        if (pointer.down) {
          const lean = pointer.x < width / 2 ? 1 : -1;
          s.spin += lean * dt * 3.4;
        }
        s.spin *= Math.pow(0.5, dt);
        s.angle += s.spin * dt;

        if (s.y <= terrain) {
          s.y = terrain;
          s.airborne = false;
          s.vy = 0;
          // Landing balance, in three bands rather than pass or fail. Only a
          // badly wrong angle ends the run; being merely untidy costs the
          // speed you were carrying, which is punishment enough to teach the
          // lesson without ending a run thirty metres in.
          const off = Math.abs(s.angle - under);
          if (off > 1.0) {
            s.crashed = 1;
            s.message = 'DOWN';
            s.messageAt = performance.now();
            finish();
          } else if (off > 0.45) {
            s.speed = Math.max(5, s.speed * 0.55);
            s.message = 'UNTIDY';
            s.messageAt = performance.now();
            s.spin = 0;
            sfxHazard();
          } else {
            // A clean landing is rewarded with drive out of it.
            if (off < 0.22) s.speed = Math.min(30, s.speed + 2.4);
            s.spin = 0;
          }
        }
      }

      // ---- pickups ---------------------------------------------------------
      while (s.nextPickup < s.x + 90) {
        const air = Math.random() < 0.55;
        s.nextPickup += 14 + Math.random() * 20;
        s.pickups.push({
          x: s.nextPickup,
          // Coins hang over the jumps, so the reward is in the air where the
          // risk is; hazards sit on the dirt where the safe line runs.
          y: terrainAt(s.nextPickup) + (air ? 52 + Math.random() * 40 : 12),
          kind: air ? 'coin' : Math.random() < 0.45 ? 'hazard' : 'coin',
          taken: false,
        });
      }

      for (const pickup of s.pickups) {
        if (pickup.taken) continue;
        if (Math.abs(pickup.x - s.x) < 1.6 && Math.abs(pickup.y - s.y) < 26) {
          pickup.taken = true;
          if (pickup.kind === 'coin') { s.coins += 1; s.flash = 1; sfxCoin(); }
          else { s.hazards += 1; s.flash = -1; s.speed = Math.max(5, s.speed - 5); sfxHazard(); }
        }
      }
      s.pickups = s.pickups.filter((p) => p.x > s.x - 20);
    }

    s.flash *= Math.max(0, 1 - dt * 2.2);

    updateOverheatScene(handle, s);

    if (scoreRef.current) scoreRef.current.textContent = `${Math.floor(s.x)}m`;
    if (tallyRef.current) {
      tallyRef.current.textContent = String(s.coins - s.hazards);
      tallyRef.current.style.color = s.flash > 0.05 ? '#4ade80' : s.flash < -0.05 ? '#ff6b6b' : '#ffffff';
    }
    if (heatRef.current) {
      const heat = Math.min(1, s.heat);
      heatRef.current.style.width = `${heat * 100}%`;
      heatRef.current.style.backgroundColor =
        heat > 0.8 ? '#ff6b6b' : heat > 0.55 ? '#f5c542' : '#4ade80';
    }
    if (messageRef.current) {
      const age = (performance.now() - s.messageAt) / 1000;
      const show = Boolean(s.message) && age < 1.4;
      messageRef.current.style.opacity = show ? '1' : '0';
      if (show) {
        messageRef.current.textContent = s.message;
        messageRef.current.style.color =
          s.message === 'DOWN' ? '#ff6b6b' : s.message === 'UNTIDY' ? '#eef2ea' : '#f5c542';
      }
    }
    if (hintRef.current) {
      hintRef.current.textContent = s.over
        ? 'TAP TO RESTART'
        : s.airborne
          ? 'LEFT LIFTS THE NOSE · RIGHT DROPS IT'
          : 'HOLD TO ACCELERATE';
    }
  }

  return (
    <Game3D<OverheatScene>
      ariaLabel="Overheat game board"
      className="h-[62vh] max-h-[520px] bg-[#1b2a3a]"
      setup={(canvas) => createOverheatScene(canvas, skin.current)}
      onFrame={frame}
      onDispose={disposeOverheatScene}
      hud={
        <>
          <div
            ref={scoreRef}
            className="absolute left-3 top-3 rounded-lg bg-black/25 px-2.5 py-1 text-[1.9rem] font-black leading-none text-white drop-shadow"
            style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
          >
            0m
          </div>

          {/* The temperature gauge — the thing the player is actually managing. */}
          <div className="absolute left-3 top-[3.4rem] w-24 rounded-md bg-black/30 p-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
              <div ref={heatRef} className="h-full w-0 rounded-full bg-[#4ade80] transition-[background-color]" />
            </div>
            <p className="mt-1 text-[0.55rem] font-bold tracking-[0.14em] text-white/70">ENGINE</p>
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
            ref={messageRef}
            className="absolute left-1/2 top-[26%] -translate-x-1/2 text-[1.6rem] font-black opacity-0 transition-opacity duration-200 drop-shadow"
            style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
          />

          <div
            ref={hintRef}
            className="absolute bottom-3 left-3 rounded-md bg-black/25 px-2 py-1 text-[0.68rem] font-bold tracking-wide text-white/90"
          >
            HOLD TO ACCELERATE
          </div>
        </>
      }
    />
  );
}
