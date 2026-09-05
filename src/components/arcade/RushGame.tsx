'use client';

import { useRef } from 'react';

import { sfxCoin, sfxHazard, sfxJump } from '@/lib/arcade/sfx';
import { useCharacter } from '@/state/use-character';

import { GameCanvas, type Frame } from './GameCanvas';
import { drawCoin, drawHazard, drawRunnerBack } from './sprites';

type Obstacle = 'train' | 'barrier' | 'rail';
interface Thing {
  /** Distance ahead of the runner, in metres. */
  z: number;
  lane: -1 | 0 | 1;
  kind: Obstacle | 'coin' | 'hazard';
  gone: boolean;
}

interface State {
  started: boolean; over: boolean;
  distance: number; speed: number;
  lane: -1 | 0 | 1; laneShift: number;
  /** Height above the track while jumping, in metres of arc. */
  air: number; airV: number; roll: number;
  things: Thing[]; spawnZ: number;
  coins: number; hazards: number; flash: number;
  stride: number; swipeX: number; swipeY: number; swiped: boolean;
}

const START: Omit<State, 'started'> = {
  over: false, distance: 0, speed: 15, lane: 0, laneShift: 0,
  air: 0, airV: 0, roll: 0, things: [], spawnZ: 40,
  coins: 0, hazards: 0, flash: 0, stride: 0, swipeX: 0, swipeY: 0, swiped: false,
};

/** How far ahead the track is drawn, in metres. */
const HORIZON = 60;

/**
 * Rush — a three-lane endless runner through a city rail corridor.
 *
 * An original game in the lane-runner genre, with that genre's full control
 * vocabulary: swipe across to change lane, up to jump, down to roll. Each
 * obstacle answers to exactly one of them — a barrier is jumped, a low rail is
 * rolled under, a standing train has to be gone around — so reading the track
 * ahead is the skill rather than reacting to a single repeated shape.
 *
 * The track is drawn in perspective by projecting each object's distance to a
 * vanishing point, which is what gives the genre its depth without any 3D.
 * Coins sit in lines that often cross a lane an obstacle is blocking, so
 * taking the whole run of them costs a safe line.
 */
export function RushGame({
  onFinish,
}: {
  onFinish: (score: number, coins: number, hazards: number) => void;
}) {
  const { character } = useCharacter();
  const state = useRef<State>({ ...START, started: false });
  const done = useRef(false);

  function reset() {
    state.current = { ...START, started: true, things: [] };
    done.current = false;
  }

  function finish() {
    const s = state.current;
    s.over = true;
    if (!done.current) {
      done.current = true;
      onFinish(Math.floor(s.distance), s.coins, s.hazards);
    }
  }

  function spawn() {
    const s = state.current;
    while (s.spawnZ < s.distance + HORIZON) {
      const lanes: (-1 | 0 | 1)[] = [-1, 0, 1];
      const roll = Math.random();

      if (roll < 0.5) {
        // An obstacle, in one or two lanes — never all three.
        const blocked = Math.random() < 0.3 ? 2 : 1;
        const shuffled = lanes.slice().sort(() => Math.random() - 0.5);
        for (let i = 0; i < blocked; i += 1) {
          const lane = shuffled[i];
          if (lane === undefined) continue;
          const kindRoll = Math.random();
          const kind: Obstacle = kindRoll < 0.4 ? 'barrier' : kindRoll < 0.72 ? 'rail' : 'train';
          s.things.push({ z: s.spawnZ, lane, kind, gone: false });
        }
      } else if (roll < 0.68) {
        // A short run of coins down one lane — still the reason to leave a
        // safe line, but three rather than five and half as often: the
        // original run left almost no stretch of track without one.
        const lane = lanes[Math.floor(Math.random() * 3)] ?? 0;
        for (let i = 0; i < 3; i += 1) {
          s.things.push({ z: s.spawnZ + i * 2.4, lane, kind: 'coin', gone: false });
        }
      } else if (roll < 0.8) {
        const lane = lanes[Math.floor(Math.random() * 3)] ?? 0;
        s.things.push({ z: s.spawnZ, lane, kind: 'hazard', gone: false });
      }
      // The remaining share spawns nothing this cycle — a clear stretch of
      // track, so the lane is occasionally just a lane rather than always
      // holding something to react to.

      s.spawnZ += 12 + Math.random() * 10;
    }
  }

  function frame({ ctx, dt, width, height, pointer }: Frame) {
    const s = state.current;
    if (!s.started) reset();

    const horizonY = height * 0.3;
    const groundY = height - 60;
    const laneW = Math.min(78, width * 0.24);

    /** Project a distance and lane to screen space. */
    const project = (z: number, lane: number, lift = 0) => {
      const t = Math.max(0.0001, z / HORIZON);
      // Perspective: near things spread out fast, far things bunch up.
      const scale = 1 / (1 + t * 6);
      const y = horizonY + (groundY - horizonY) * scale;
      const x = width / 2 + lane * laneW * scale;
      return { x, y: y - lift * (groundY - horizonY) * scale * 0.55, scale };
    };

    if (pointer.pressed && s.over && done.current) {
      reset();
      return;
    }

    // ---- input: swipes, measured across the whole press --------------------
    if (pointer.pressed) {
      s.swipeX = 0;
      s.swipeY = 0;
      s.swiped = false;
    }
    if (pointer.down && !s.over) {
      s.swipeX += pointer.dx;
      s.swipeY += pointer.dy;
      if (!s.swiped) {
        const THRESHOLD = 26;
        if (Math.abs(s.swipeX) > Math.abs(s.swipeY) && Math.abs(s.swipeX) > THRESHOLD) {
          const next = s.lane + (s.swipeX > 0 ? 1 : -1);
          s.lane = Math.max(-1, Math.min(1, next)) as -1 | 0 | 1;
          s.swiped = true;
        } else if (Math.abs(s.swipeY) > THRESHOLD) {
          if (s.swipeY < 0 && s.air <= 0 && s.roll <= 0) {
            s.airV = 8.4;
            sfxJump();
          } else if (s.swipeY > 0 && s.air <= 0) {
            s.roll = 0.62;
            sfxJump();
          }
          s.swiped = true;
        }
      }
    }

    if (!s.over) {
      // ---- movement --------------------------------------------------------
      s.speed = Math.min(38, 15 + s.distance * 0.012);
      s.distance += s.speed * dt;
      s.stride += dt * s.speed * 0.8;

      s.laneShift += (s.lane - s.laneShift) * Math.min(1, dt * 12);

      if (s.airV !== 0 || s.air > 0) {
        s.airV -= 24 * dt;
        s.air = Math.max(0, s.air + s.airV * dt);
        if (s.air <= 0) s.airV = 0;
      }
      s.roll = Math.max(0, s.roll - dt);

      spawn();

      // ---- collisions ------------------------------------------------------
      for (const thing of s.things) {
        if (thing.gone) continue;
        const gap = thing.z - s.distance;
        if (gap > 1.4 || gap < -1.4) continue;
        if (Math.abs(thing.lane - s.laneShift) > 0.45) continue;

        if (thing.kind === 'coin') {
          // A coin can be taken in the air or on the ground.
          thing.gone = true;
          s.coins += 1;
          s.flash = 1;
          sfxCoin();
        } else if (thing.kind === 'hazard') {
          thing.gone = true;
          s.hazards += 1;
          s.flash = -1;
          sfxHazard();
        } else if (thing.kind === 'barrier') {
          if (s.air < 0.35) finish();
        } else if (thing.kind === 'rail') {
          if (s.roll <= 0) finish();
        } else {
          // A standing train cannot be jumped or rolled — only avoided.
          finish();
        }
      }

      s.things = s.things.filter((thing) => thing.z > s.distance - 6);
    }

    s.flash *= Math.max(0, 1 - dt * 2.4);

    // ---- draw --------------------------------------------------------------
    ctx.clearRect(0, 0, width, height);

    // Sky and city skyline, parallaxed against distance.
    ctx.fillStyle = '#1d2433';
    ctx.fillRect(0, 0, width, horizonY);
    ctx.fillStyle = '#141a26';
    for (let i = 0; i < 14; i += 1) {
      const bw = 26 + ((i * 53) % 40);
      const bh = 20 + ((i * 97) % 70);
      const bx = ((i * 91 - s.distance * 1.4) % (width + 80) + width + 80) % (width + 80) - 40;
      ctx.fillRect(bx, horizonY - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,214,120,0.35)';
      for (let w = 0; w < 3; w += 1) {
        ctx.fillRect(bx + 5 + w * 8, horizonY - bh + 8 + (i % 3) * 9, 3, 4);
      }
      ctx.fillStyle = '#141a26';
    }

    // Track bed.
    ctx.fillStyle = '#2b3242';
    ctx.beginPath();
    const nearL = project(0.01, -1.6);
    const nearR = project(0.01, 1.6);
    const farL = project(HORIZON, -1.6);
    const farR = project(HORIZON, 1.6);
    ctx.moveTo(nearL.x, nearL.y);
    ctx.lineTo(farL.x, farL.y);
    ctx.lineTo(farR.x, farR.y);
    ctx.lineTo(nearR.x, nearR.y);
    ctx.closePath();
    ctx.fill();

    // Lane dividers and sleepers, both anchored to real distance so the
    // ground reads as moving at the speed the runner is actually going.
    ctx.strokeStyle = 'rgba(200,255,77,0.25)';
    ctx.lineWidth = 2;
    for (const lane of [-0.5, 0.5]) {
      const a = project(0.01, lane * 2);
      const b = project(HORIZON, lane * 2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 30; i += 1) {
      const z = i * 2 - (s.distance % 2);
      if (z < 0.5) continue;
      const a = project(z, -1.6);
      const b = project(z, 1.6);
      ctx.lineWidth = Math.max(0.5, 4 * a.scale);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Far things first, so near ones overlap them correctly.
    const sorted = s.things.slice().sort((a, b) => b.z - a.z);
    for (const thing of sorted) {
      if (thing.gone) continue;
      const gap = thing.z - s.distance;
      if (gap < -2 || gap > HORIZON) continue;
      const p = project(Math.max(0.2, gap), thing.lane);
      const size = 74 * p.scale;

      if (thing.kind === 'coin') {
        drawCoin(ctx, p.x, p.y - size * 0.55, Math.max(3, size * 0.2), performance.now() / 220 + thing.z);
      } else if (thing.kind === 'hazard') {
        drawHazard(ctx, p.x, p.y - size * 0.2, Math.max(3, size * 0.2));
      } else if (thing.kind === 'train') {
        ctx.fillStyle = '#b8342a';
        ctx.fillRect(p.x - size * 0.42, p.y - size * 1.5, size * 0.84, size * 1.5);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(p.x - size * 0.32, p.y - size * 1.25, size * 0.64, size * 0.4);
        ctx.fillStyle = '#8c2620';
        ctx.fillRect(p.x - size * 0.42, p.y - size * 0.2, size * 0.84, size * 0.2);
      } else if (thing.kind === 'barrier') {
        ctx.fillStyle = '#f5c542';
        ctx.fillRect(p.x - size * 0.36, p.y - size * 0.62, size * 0.72, size * 0.5);
        ctx.fillStyle = '#17120e';
        for (let i = 0; i < 3; i += 1) {
          ctx.fillRect(p.x - size * 0.36 + i * size * 0.24, p.y - size * 0.62, size * 0.1, size * 0.5);
        }
      } else {
        // A rail to roll under: legs on the ground, bar overhead.
        ctx.fillStyle = '#8d939b';
        ctx.fillRect(p.x - size * 0.42, p.y - size * 1.15, size * 0.84, size * 0.18);
        ctx.fillRect(p.x - size * 0.42, p.y - size * 1.15, size * 0.1, size * 1.15);
        ctx.fillRect(p.x + size * 0.32, p.y - size * 1.15, size * 0.1, size * 1.15);
      }
    }

    // The runner sits at a fixed point on the track, everything else moves.
    // Kept near the bottom and sized to the track at that depth — drawn any
    // larger and he reads as standing in front of the screen rather than on
    // the rails, which breaks the perspective the whole game depends on.
    const me = project(1.3, s.laneShift, s.air * 0.16);
    drawRunnerBack(
      ctx,
      me.x,
      me.y,
      me.scale * 2.1,
      s.stride,
      s.roll > 0 ? 2 : s.air > 0.1 ? 1 : 0,
      character.body,
      character.accent,
    );

    // ---- hud ---------------------------------------------------------------
    ctx.fillStyle = '#eef2ea';
    ctx.font = '900 34px Archivo, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.floor(s.distance)}m`, 16, 42);

    drawCoin(ctx, width - 74, 32, 12);
    ctx.font = '900 24px Archivo, system-ui, sans-serif';
    ctx.fillStyle = s.flash > 0.05 ? '#4ade80' : s.flash < -0.05 ? '#ff6b6b' : '#eef2ea';
    ctx.fillText(String(s.coins - s.hazards), width - 56, 41);

    ctx.font = '700 11px Archivo, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(238,242,234,0.55)';
    ctx.fillText(
      s.over ? 'TAP TO RESTART' : 'SWIPE ACROSS · UP TO JUMP · DOWN TO ROLL',
      16,
      height - 14,
    );
  }

  return (
    <GameCanvas
      running
      onFrame={frame}
      ariaLabel="Rush game board"
      className="h-[62vh] max-h-[520px] w-full rounded-[1.25rem] bg-[#0d121c]"
    />
  );
}
