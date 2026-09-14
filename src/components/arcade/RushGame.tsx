'use client';

import { useRef } from 'react';

import {
  createRushScene,
  disposeRushScene,
  updateRushScene,
  type RushScene,
  type RushThing,
} from '@/lib/arcade/rush3d';
import { currentCharacter } from '@/lib/arcade/characters';
import { sfxCoin, sfxHazard, sfxJump } from '@/lib/arcade/sfx';

import { Game3D, Hud, type Frame3D } from './Game3D';

interface State {
  started: boolean; over: boolean;
  distance: number; speed: number;
  lane: -1 | 0 | 1; laneShift: number;
  /** Height above the track while jumping, in metres of arc. */
  air: number; airV: number; roll: number;
  things: RushThing[]; spawnZ: number;
  coins: number; hazards: number; flash: number;
  stride: number; swipeX: number; swipeY: number; swiped: boolean;
}

const START: Omit<State, 'started'> = {
  over: false, distance: 0, speed: 15, lane: 0, laneShift: 0,
  air: 0, airV: 0, roll: 0, things: [], spawnZ: 40,
  coins: 0, hazards: 0, flash: 0, stride: 0, swipeX: 0, swipeY: 0, swiped: false,
};

/** How far ahead the track is populated, in metres. */
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
 * The track is real 3D geometry now rather than a hand-projected vanishing
 * point, but the game underneath is untouched: distance, lane and jump height
 * were always the state, and the collision checks still read exactly the same
 * numbers they always did.
 */
export function RushGame({
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
          const kind = kindRoll < 0.4 ? 'barrier' : kindRoll < 0.72 ? 'rail' : 'train';
          s.things.push({ z: s.spawnZ, lane, kind, gone: false });
        }
      } else if (roll < 0.68) {
        // A short run of coins down one lane — the reason to leave a safe line.
        const lane = lanes[Math.floor(Math.random() * 3)] ?? 0;
        for (let i = 0; i < 3; i += 1) {
          s.things.push({ z: s.spawnZ + i * 2.4, lane, kind: 'coin', gone: false });
        }
      } else if (roll < 0.8) {
        const lane = lanes[Math.floor(Math.random() * 3)] ?? 0;
        s.things.push({ z: s.spawnZ, lane, kind: 'hazard', gone: false });
      }
      // The remaining share spawns nothing this cycle — a clear stretch of
      // track, so the lane is occasionally just a lane.

      s.spawnZ += 12 + Math.random() * 10;
    }
  }

  function frame({ handle, dt, pointer }: Frame3D<RushScene>) {
    const s = state.current;
    if (!s.started) reset();

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

    updateRushScene(handle, s);

    if (scoreRef.current) scoreRef.current.textContent = `${Math.floor(s.distance)}m`;
    if (tallyRef.current) {
      tallyRef.current.textContent = String(s.coins - s.hazards);
      tallyRef.current.style.color = s.flash > 0.05 ? '#4ade80' : s.flash < -0.05 ? '#ff6b6b' : '#ffffff';
    }
    if (hintRef.current) {
      hintRef.current.textContent = s.over
        ? 'TAP TO RESTART'
        : 'SWIPE ACROSS · UP TO JUMP · DOWN TO ROLL';
    }
  }

  return (
    <Game3D<RushScene>
      ariaLabel="Rush game board"
      className="h-[62vh] max-h-[520px] bg-[#1d2433]"
      setup={(canvas) => createRushScene(canvas, skin.current)}
      onFrame={frame}
      onDispose={disposeRushScene}
      hud={
        <Hud
          scoreRef={scoreRef}
          tallyRef={tallyRef}
          hintRef={hintRef}
          hint="SWIPE ACROSS · UP TO JUMP · DOWN TO ROLL"
        />
      }
    />
  );
}
