'use client';

import { useRef } from 'react';

import {
  createPitchScene,
  disposePitchScene,
  updatePitchScene,
  type PitchPickup,
  type PitchScene,
  type PitchWall,
} from '@/lib/arcade/pitch3d';
import { sfxCoin, sfxGoal, sfxHazard } from '@/lib/arcade/sfx';

import { Game3D, type Frame3D } from './Game3D';

interface State {
  started: boolean; over: boolean;
  /** Ball position and velocity, in pixels and pixels per second. */
  bx: number; by: number; vx: number; vy: number;
  /** Sideways acceleration applied while the ball is travelling — the curl. */
  curl: number; spin: number; live: boolean;
  aiming: boolean; aimX: number; aimY: number;
  wall: PitchWall[]; keeperX: number; keeperDir: number; keeperSpeed: number;
  pickups: PitchPickup[];
  goals: number; attempts: number; coins: number; hazards: number;
  flash: number; message: string; messageAt: number;
}

const SHOTS = 10;

const START: Omit<State, 'started'> = {
  over: false, bx: 0, by: 0, vx: 0, vy: 0, curl: 0, spin: 0, live: false,
  aiming: false, aimX: 0, aimY: 0, wall: [], keeperX: 0.5, keeperDir: 1, keeperSpeed: 90,
  pickups: [], goals: 0, attempts: 0, coins: 0, hazards: 0,
  flash: 0, message: '', messageAt: 0,
};

/**
 * Pitch — free kicks where the ball bends hard.
 *
 * An original game in the free-kick genre, built around that genre's
 * signature: heavy curl. Drag back from the ball and let go — the direction
 * sets the aim, the length sets the power, and the sideways component of the
 * drag sets how much the ball bends in flight. A straight shot has no chance
 * against a set wall; the whole game is learning to bend one round it.
 *
 * Ten shots per round. Coins sit on the pitch and are collected by the ball as
 * it travels, which usually means choosing a line that is worse for scoring.
 *
 * The ball still moves in the same plane it always did — the camera simply
 * stands behind it now instead of above, which is the view that makes a
 * bending shot legible.
 */
export function PitchGame({
  onFinish,
}: {
  onFinish: (score: number, coins: number, hazards: number) => void;
}) {
  const state = useRef<State>({ ...START, started: false });
  const done = useRef(false);

  const scoreRef = useRef<HTMLDivElement | null>(null);
  const shotRef = useRef<HTMLDivElement | null>(null);
  const tallyRef = useRef<HTMLDivElement | null>(null);
  const messageRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);

  function layout(width: number, height: number) {
    const goalW = Math.min(190, width * 0.56);
    return {
      goalW,
      goalX: (width - goalW) / 2,
      goalY: 54,
      spotY: height - 96,
      keeperY: 74,
    };
  }

  function setPiece(width: number, height: number) {
    const s = state.current;
    const { spotY } = layout(width, height);
    s.bx = width / 2 + (Math.random() - 0.5) * width * 0.42;
    s.by = spotY;
    s.vx = 0;
    s.vy = 0;
    s.curl = 0;
    s.live = false;

    // A wall of defenders between the ball and the goal, offset a little each
    // time so the same shot never works twice.
    const count = 3 + Math.floor(Math.random() * 2);
    const spread = 30;
    const wallY = spotY - 130 - Math.random() * 40;
    const centre = s.bx + (width / 2 - s.bx) * 0.45;
    s.wall = [];
    for (let i = 0; i < count; i += 1) {
      s.wall.push({
        x: centre + (i - (count - 1) / 2) * spread,
        y: wallY,
        drift: (Math.random() - 0.5) * 26,
      });
    }

    // Two things on the pitch worth a detour.
    s.pickups = [];
    for (let i = 0; i < 2; i += 1) {
      s.pickups.push({
        x: width * (0.16 + Math.random() * 0.68),
        y: spotY - 60 - Math.random() * 190,
        kind: Math.random() < 0.7 ? 'coin' : 'hazard',
        taken: false,
      });
    }

    s.keeperSpeed = 90 + s.goals * 12;
  }

  function reset(width: number, height: number) {
    state.current = { ...START, started: true, wall: [], pickups: [] };
    done.current = false;
    setPiece(width, height);
  }

  function finish() {
    const s = state.current;
    s.over = true;
    if (!done.current) {
      done.current = true;
      onFinish(s.goals, s.coins, s.hazards);
    }
  }

  function frame({ handle, dt, width, height, pointer }: Frame3D<PitchScene>) {
    const s = state.current;
    if (!s.started) reset(width, height);

    const { goalW, goalX, goalY, keeperY } = layout(width, height);

    if (pointer.pressed && s.over && done.current) {
      reset(width, height);
      return;
    }

    function nextShot() {
      if (s.attempts >= SHOTS) finish();
      else setPiece(width, height);
    }

    // ---- aiming: drag back from the ball, release to strike ---------------
    if (!s.over && !s.live) {
      if (pointer.pressed) {
        s.aiming = true;
        s.aimX = pointer.x;
        s.aimY = pointer.y;
      }
      if (s.aiming && pointer.down) {
        s.aimX = pointer.x;
        s.aimY = pointer.y;
      }
      if (s.aiming && pointer.released) {
        s.aiming = false;
        const dx = s.bx - s.aimX;
        const dy = s.by - s.aimY;
        const power = Math.min(1, Math.hypot(dx, dy) / 150);
        if (power > 0.12) {
          const angle = Math.atan2(dy, dx);
          const speed = 250 + power * 520;
          s.vx = Math.cos(angle) * speed;
          s.vy = Math.sin(angle) * speed;
          // The drag's sideways offset becomes bend. Pulling straight back
          // gives a straight shot; pulling off to one side bends it hard.
          s.curl = (dx / Math.max(40, Math.abs(dy))) * -520;
          s.live = true;
          s.attempts += 1;
        }
      }
    }

    // ---- keeper patrols the line ------------------------------------------
    if (!s.over) {
      s.keeperX += (s.keeperDir * s.keeperSpeed * dt) / goalW;
      if (s.keeperX > 0.86) { s.keeperX = 0.86; s.keeperDir = -1; }
      if (s.keeperX < 0.14) { s.keeperX = 0.14; s.keeperDir = 1; }
    }

    // ---- ball --------------------------------------------------------------
    if (s.live) {
      s.vx += s.curl * dt;
      // Drag, so a shot slows as it travels and the bend has time to bite.
      const drag = Math.pow(0.35, dt);
      s.vx *= drag;
      s.vy *= drag;
      s.bx += s.vx * dt;
      s.by += s.vy * dt;
      s.spin += (s.vx * 0.02 + Math.abs(s.vy) * 0.01) * dt * 6;

      for (const pickup of s.pickups) {
        if (pickup.taken) continue;
        if (Math.hypot(pickup.x - s.bx, pickup.y - s.by) < 20) {
          pickup.taken = true;
          if (pickup.kind === 'coin') { s.coins += 1; s.flash = 1; sfxCoin(); }
          else { s.hazards += 1; s.flash = -1; sfxHazard(); }
        }
      }

      for (const defender of s.wall) {
        if (Math.hypot(defender.x - s.bx, defender.y - s.by) < 19) {
          s.message = 'Off the wall';
          s.messageAt = performance.now();
          s.live = false;
          sfxHazard();
          nextShot();
        }
      }

      const keeperPx = goalX + s.keeperX * goalW;
      if (s.by < keeperY + 16 && s.by > keeperY - 16 && Math.abs(s.bx - keeperPx) < 30) {
        s.message = 'Keeper saves';
        s.messageAt = performance.now();
        s.live = false;
        sfxHazard();
        nextShot();
      } else if (s.by < goalY + 6) {
        if (s.bx > goalX && s.bx < goalX + goalW) {
          s.goals += 1;
          s.message = 'GOAL';
          sfxGoal();
        } else {
          s.message = 'Wide';
          sfxHazard();
        }
        s.messageAt = performance.now();
        s.live = false;
        nextShot();
      } else if (s.bx < -40 || s.bx > width + 40 || s.by > height + 40 || Math.hypot(s.vx, s.vy) < 30) {
        // Unconditional: carrying the previous shot's message forward would
        // announce a goal for a shot that never reached the box.
        s.message = 'Short';
        s.messageAt = performance.now();
        s.live = false;
        sfxHazard();
        nextShot();
      }
    }

    s.flash *= Math.max(0, 1 - dt * 2.2);

    updatePitchScene(
      handle,
      { ...s, layout: { goalW, goalX, goalY, keeperY } },
      width,
      height,
    );

    if (scoreRef.current) scoreRef.current.textContent = String(s.goals);
    if (shotRef.current) {
      shotRef.current.textContent = `SHOT ${Math.min(s.attempts + 1, SHOTS)} OF ${SHOTS}`;
    }
    if (tallyRef.current) {
      tallyRef.current.textContent = String(s.coins - s.hazards);
      tallyRef.current.style.color = s.flash > 0.05 ? '#4ade80' : s.flash < -0.05 ? '#ff6b6b' : '#ffffff';
    }
    if (messageRef.current) {
      const age = (performance.now() - s.messageAt) / 1000;
      const show = Boolean(s.message) && age < 1.3;
      messageRef.current.style.opacity = show ? '1' : '0';
      if (show) {
        messageRef.current.textContent = s.message;
        messageRef.current.style.color = s.message === 'GOAL' ? '#c8ff4d' : 'rgba(255,255,255,0.9)';
      }
    }
    if (hintRef.current) {
      hintRef.current.textContent = s.over
        ? 'TAP TO RESTART'
        : 'DRAG BACK FROM THE BALL · RELEASE TO STRIKE';
    }
  }

  return (
    <Game3D<PitchScene>
      ariaLabel="Pitch game board"
      className="h-[62vh] max-h-[520px] bg-[#101a24]"
      setup={(canvas) => createPitchScene(canvas)}
      onFrame={frame}
      onDispose={disposePitchScene}
      hud={
        <>
          <div className="absolute left-3 top-3 rounded-lg bg-black/25 px-2.5 py-1">
            <div
              ref={scoreRef}
              className="text-[1.9rem] font-black leading-none text-white drop-shadow"
              style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
            >
              0
            </div>
            <div ref={shotRef} className="mt-0.5 text-[0.58rem] font-bold tracking-[0.14em] text-white/60">
              SHOT 1 OF {SHOTS}
            </div>
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
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[1.7rem] font-black opacity-0 transition-opacity duration-200 drop-shadow"
            style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
          />

          <div
            ref={hintRef}
            className="absolute bottom-3 left-3 rounded-md bg-black/25 px-2 py-1 text-[0.68rem] font-bold tracking-wide text-white/90"
          >
            DRAG BACK FROM THE BALL · RELEASE TO STRIKE
          </div>
        </>
      }
    />
  );
}
