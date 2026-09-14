'use client';

import { useRef } from 'react';

import {
  createAlleyScene,
  disposeAlleyScene,
  updateAlleyScene,
  type AlleyDrop,
  type AlleyEnemy,
  type AlleyItem,
  type AlleyScene,
} from '@/lib/arcade/alley3d';
import { sfxCoin, sfxHazard, sfxHit } from '@/lib/arcade/sfx';
import { useCharacter } from '@/state/use-character';

import { Game3D, type Frame3D } from './Game3D';

type Weapon = 'none' | 'pipe' | 'crate';

interface State {
  started: boolean; over: boolean;
  px: number; py: number; facing: 1 | -1;
  strike: number; strikeCool: number; hurt: number; hp: number;
  weapon: Weapon; weaponUses: number;
  enemies: AlleyEnemy[]; items: AlleyItem[]; drops: AlleyDrop[];
  floored: number; coins: number; hazards: number; flash: number;
  wave: number; spawnCool: number;
  /** Press tracking, to tell a tap (strike) from a drag (move). */
  pressX: number; pressY: number; pressAt: number; dragged: boolean;
  targetX: number | null; targetY: number | null;
}

const START: Omit<State, 'started'> = {
  over: false, px: 0, py: 0, facing: 1, strike: 0, strikeCool: 0, hurt: 0, hp: 3,
  weapon: 'none', weaponUses: 0, enemies: [], items: [], drops: [],
  floored: 0, coins: 0, hazards: 0, flash: 0, wave: 1, spawnCool: 0,
  pressX: 0, pressY: 0, pressAt: 0, dragged: false, targetX: null, targetY: null,
};

const SHIRTS = ['#6d4aff', '#2b6cb0', '#b8342a', '#7a5230'];

/**
 * Alley — a street brawl where what is lying around decides the fight.
 *
 * An original game in the beat-'em-up genre, built around the thing that genre
 * is remembered for: picking up whatever is on the floor and hitting people
 * with it. Bare fists are short-range and slow. A pipe doubles your reach, a
 * crate hits far harder but only survives a couple of swings, and both are
 * lying in the street rather than granted — so the fight is a running argument
 * about whether to break off and go and arm yourself.
 *
 * Movement is a drag anywhere and a strike is a tap, which keeps both hands
 * off a virtual pad. Enemies close from both ends and hang back when the
 * player is armed, so a weapon buys space as well as damage.
 *
 * The floor band the game already used for depth is now actual depth, so where
 * a punch lands is still decided by exactly the same numbers.
 */
export function AlleyGame({
  onFinish,
}: {
  onFinish: (score: number, coins: number, hazards: number) => void;
}) {
  const { character } = useCharacter();
  const skin = useRef({ body: character.body, accent: character.accent });
  skin.current = { body: character.body, accent: character.accent };

  const state = useRef<State>({ ...START, started: false });
  const done = useRef(false);

  const scoreRef = useRef<HTMLDivElement | null>(null);
  const hpRef = useRef<HTMLDivElement | null>(null);
  const weaponRef = useRef<HTMLDivElement | null>(null);
  const tallyRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);

  function reset(width: number, height: number) {
    state.current = {
      ...START,
      started: true,
      px: width / 2,
      py: height * 0.72,
      enemies: [],
      items: [],
      drops: [],
    };
    done.current = false;
  }

  function finish() {
    const s = state.current;
    s.over = true;
    if (!done.current) {
      done.current = true;
      onFinish(s.floored, s.coins, s.hazards);
    }
  }

  function frame({ handle, dt, width, height, pointer }: Frame3D<AlleyScene>) {
    const s = state.current;
    if (!s.started) reset(width, height);

    const floorTop = height * 0.52;
    const floorBottom = height - 34;
    const reach = s.weapon === 'pipe' ? 68 : s.weapon === 'crate' ? 56 : 42;
    const damage = s.weapon === 'crate' ? 3 : s.weapon === 'pipe' ? 2 : 1;

    if (pointer.pressed && s.over && done.current) {
      reset(width, height);
      return;
    }

    // ---- input: drag to move, tap to strike -------------------------------
    if (pointer.pressed && !s.over) {
      s.pressX = pointer.x;
      s.pressY = pointer.y;
      s.pressAt = performance.now();
      s.dragged = false;
    }
    if (pointer.down && !s.over) {
      if (Math.hypot(pointer.x - s.pressX, pointer.y - s.pressY) > 14) s.dragged = true;
      if (s.dragged) {
        s.targetX = pointer.x;
        s.targetY = Math.max(floorTop, Math.min(floorBottom, pointer.y));
      }
    }
    if (pointer.released && !s.over) {
      const quick = performance.now() - s.pressAt < 320;
      if (!s.dragged && quick && s.strikeCool <= 0) {
        s.strike = 1;
        s.strikeCool = 0.34;

        // Picking something up is the same tap, when stood over it.
        const item = s.items.find(
          (i) => !i.taken && Math.abs(i.x - s.px) < 34 && Math.abs(i.y - s.py) < 26,
        );
        if (item) {
          item.taken = true;
          s.weapon = item.kind;
          s.weaponUses = item.kind === 'crate' ? 3 : 6;
          s.strike = 0;
          s.strikeCool = 0.15;
          sfxCoin();
        } else {
          // A connecting swing lands on everyone in front of you.
          let connected = false;
          for (const enemy of s.enemies) {
            if (enemy.down > 0) continue;
            const ahead = (enemy.x - s.px) * s.facing;
            if (ahead > -12 && ahead < reach && Math.abs(enemy.y - s.py) < 30) {
              enemy.hp -= damage;
              enemy.hurt = 0.3;
              enemy.x += s.facing * (s.weapon === 'crate' ? 26 : 14);
              connected = true;
              if (enemy.hp <= 0) {
                enemy.down = 1.1;
                s.floored += 1;
                const roll = Math.random();
                if (roll < 0.5) {
                  s.drops.push({
                    x: enemy.x,
                    y: enemy.y,
                    kind: roll < 0.42 ? 'coin' : 'hazard',
                    life: 6,
                  });
                }
              }
            }
          }
          if (connected) sfxHit();
          if (connected && s.weapon !== 'none') {
            s.weaponUses -= 1;
            if (s.weaponUses <= 0) s.weapon = 'none';
          }
        }
      }
      s.targetX = null;
      s.targetY = null;
    }

    if (!s.over) {
      // ---- player ----------------------------------------------------------
      s.strike = Math.max(0, s.strike - dt * 4.5);
      s.strikeCool = Math.max(0, s.strikeCool - dt);
      s.hurt = Math.max(0, s.hurt - dt);

      if (s.targetX !== null && s.targetY !== null) {
        const dx = s.targetX - s.px;
        const dy = s.targetY - s.py;
        const dist = Math.hypot(dx, dy);
        if (dist > 3) {
          const step = Math.min(dist, 190 * dt);
          s.px += (dx / dist) * step;
          s.py += (dy / dist) * step;
          if (Math.abs(dx) > 6) s.facing = dx > 0 ? 1 : -1;
        }
      }
      s.px = Math.max(24, Math.min(width - 24, s.px));
      s.py = Math.max(floorTop, Math.min(floorBottom, s.py));

      // ---- waves -----------------------------------------------------------
      s.spawnCool -= dt;
      const standing = s.enemies.filter((e) => e.down <= 0).length;
      if (s.spawnCool <= 0 && standing < 2 + Math.floor(s.wave / 2)) {
        s.spawnCool = Math.max(0.7, 2.2 - s.wave * 0.12);
        const fromLeft = Math.random() < 0.5;
        s.enemies.push({
          x: fromLeft ? -30 : width + 30,
          y: floorTop + Math.random() * (floorBottom - floorTop),
          hp: 1 + Math.floor(s.wave / 3),
          strike: 0,
          cool: 0.6 + Math.random() * 0.6,
          hurt: 0,
          down: 0,
          shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)] ?? '#6d4aff',
          speed: 52 + s.wave * 3 + Math.random() * 18,
        });
        if (s.floored > 0 && s.floored % 6 === 0) s.wave += 1;
      }

      // Something to pick up, kept on the street so a plan is always possible.
      if (s.items.filter((i) => !i.taken).length < 2 && Math.random() < dt * 0.55) {
        s.items.push({
          x: 40 + Math.random() * (width - 80),
          y: floorTop + Math.random() * (floorBottom - floorTop),
          kind: Math.random() < 0.55 ? 'pipe' : 'crate',
          taken: false,
        });
      }

      // ---- enemies ---------------------------------------------------------
      for (const enemy of s.enemies) {
        if (enemy.down > 0) {
          enemy.down -= dt;
          continue;
        }
        enemy.hurt = Math.max(0, enemy.hurt - dt);
        enemy.strike = Math.max(0, enemy.strike - dt * 4.5);
        enemy.cool -= dt;

        const dx = s.px - enemy.x;
        const dy = s.py - enemy.y;
        const dist = Math.hypot(dx, dy);
        // An armed player is given a wider berth, so a weapon buys room.
        const standoff = s.weapon === 'none' ? 34 : 52;

        if (dist > standoff) {
          const step = enemy.speed * dt;
          enemy.x += (dx / dist) * step;
          enemy.y += (dy / dist) * step;
        } else if (enemy.cool <= 0) {
          enemy.cool = 1.4;
          enemy.strike = 1;
          // The window after a hit is long enough to actually get clear —
          // without it a second attacker lands the follow-up for free and
          // three lives disappear in a few seconds.
          if (dist < 46 && s.hurt <= 0) {
            s.hp -= 1;
            s.hurt = 1.3;
            s.hazards += 1;
            s.flash = -1;
            s.px -= Math.sign(dx) * 22;
            sfxHazard();
            if (s.hp <= 0) finish();
          }
        }
      }
      s.enemies = s.enemies.filter((e) => e.down > -1.5);

      // ---- drops -----------------------------------------------------------
      for (const drop of s.drops) drop.life -= dt;
      s.drops = s.drops.filter((drop) => {
        if (Math.hypot(drop.x - s.px, drop.y - s.py) < 26) {
          if (drop.kind === 'coin') { s.coins += 1; s.flash = 1; sfxCoin(); }
          else { s.hazards += 1; s.flash = -1; sfxHazard(); }
          return false;
        }
        return drop.life > 0;
      });
    }

    s.flash *= Math.max(0, 1 - dt * 2.2);

    updateAlleyScene(handle, { ...s, layout: { floorTop, floorBottom } }, width, height);

    if (scoreRef.current) scoreRef.current.textContent = String(s.floored);
    if (hpRef.current) {
      const bars = hpRef.current.children;
      for (let i = 0; i < bars.length; i += 1) {
        (bars[i] as HTMLElement).style.opacity = i < s.hp ? '1' : '0.2';
      }
    }
    if (weaponRef.current) {
      const armed = s.weapon !== 'none';
      weaponRef.current.style.opacity = armed ? '1' : '0';
      if (armed) weaponRef.current.textContent = `${s.weapon.toUpperCase()} ×${s.weaponUses}`;
    }
    if (tallyRef.current) {
      tallyRef.current.textContent = String(s.coins - s.hazards);
      tallyRef.current.style.color = s.flash > 0.05 ? '#4ade80' : s.flash < -0.05 ? '#ff6b6b' : '#ffffff';
    }
    if (hintRef.current) {
      hintRef.current.textContent = s.over
        ? 'TAP TO RESTART'
        : 'DRAG TO MOVE · TAP TO STRIKE · TAP ON A WEAPON TO LIFT IT';
    }
  }

  return (
    <Game3D<AlleyScene>
      ariaLabel="Alley game board"
      className="h-[62vh] max-h-[520px] bg-[#15110d]"
      setup={(canvas) => createAlleyScene(canvas, skin.current.body, skin.current.accent)}
      onFrame={frame}
      onDispose={disposeAlleyScene}
      hud={
        <>
          <div className="absolute left-3 top-3">
            <div
              className="rounded-lg bg-black/25 px-2.5 py-1 text-[1.9rem] font-black leading-none text-white drop-shadow"
              style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
              ref={scoreRef}
            >
              0
            </div>
            <div ref={hpRef} className="mt-1.5 flex gap-1">
              <span className="h-1.5 w-3.5 rounded-sm bg-[#ff6a1a]" />
              <span className="h-1.5 w-3.5 rounded-sm bg-[#ff6a1a]" />
              <span className="h-1.5 w-3.5 rounded-sm bg-[#ff6a1a]" />
            </div>
            <div
              ref={weaponRef}
              className="mt-1.5 text-[0.62rem] font-bold tracking-[0.1em] text-[#f5c542] opacity-0 transition-opacity"
            />
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
            className="absolute bottom-3 left-3 rounded-md bg-black/25 px-2 py-1 text-[0.62rem] font-bold tracking-wide text-white/90"
          >
            DRAG TO MOVE · TAP TO STRIKE · TAP ON A WEAPON TO LIFT IT
          </div>
        </>
      }
    />
  );
}
