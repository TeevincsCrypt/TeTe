'use client';

import { useRef } from 'react';

import { sfxCoin, sfxHazard, sfxHit } from '@/lib/arcade/sfx';
import { useCharacter } from '@/state/use-character';

import { GameCanvas, type Frame } from './GameCanvas';
import { drawBrawler, drawCoin, drawHazard, drawStreetItem } from './sprites';

type Weapon = 'none' | 'pipe' | 'crate';

interface Enemy {
  x: number; y: number; hp: number; strike: number; cool: number;
  hurt: number; down: number; shirt: string; speed: number;
}
interface Item { x: number; y: number; kind: 'pipe' | 'crate'; taken: boolean }
interface Drop { x: number; y: number; kind: 'coin' | 'hazard'; life: number }

interface State {
  started: boolean; over: boolean;
  px: number; py: number; facing: 1 | -1;
  strike: number; strikeCool: number; hurt: number; hp: number;
  weapon: Weapon; weaponUses: number;
  enemies: Enemy[]; items: Item[]; drops: Drop[];
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
 * Alley — a side-on street brawl where what is lying around decides the fight.
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
 */
export function AlleyGame({
  onFinish,
}: {
  onFinish: (score: number, coins: number, hazards: number) => void;
}) {
  const { character } = useCharacter();
  const state = useRef<State>({ ...START, started: false });
  const done = useRef(false);

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

  function frame({ ctx, dt, width, height, pointer }: Frame) {
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

    // ---- draw --------------------------------------------------------------
    ctx.clearRect(0, 0, width, height);

    // Back wall: brick, shutters, a street lamp — an alley, not a void.
    ctx.fillStyle = '#2c2620';
    ctx.fillRect(0, 0, width, floorTop);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let row = 0; row * 16 < floorTop; row += 1) {
      const y = row * 16;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      for (let col = 0; col * 34 < width; col += 1) {
        const x = col * 34 + (row % 2 ? 17 : 0);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 16);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#1d1915';
    ctx.fillRect(width * 0.12, floorTop - 92, 78, 92);
    ctx.fillRect(width * 0.66, floorTop - 74, 62, 74);
    ctx.fillStyle = 'rgba(245,197,66,0.16)';
    ctx.beginPath();
    ctx.moveTo(width * 0.84, 0);
    ctx.lineTo(width * 0.96, 0);
    ctx.lineTo(width * 1.02, floorTop);
    ctx.lineTo(width * 0.78, floorTop);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3a352e';
    ctx.fillRect(0, floorTop, width, height - floorTop);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 5; i += 1) {
      const y = floorTop + ((height - floorTop) * i) / 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    for (const item of s.items) {
      if (item.taken) continue;
      drawStreetItem(ctx, item.kind, item.x, item.y);
    }
    for (const drop of s.drops) {
      if (drop.kind === 'coin') drawCoin(ctx, drop.x, drop.y - 12, 11, performance.now() / 240);
      else drawHazard(ctx, drop.x, drop.y - 12, 11);
    }

    // Depth sort, so someone standing further up the alley is drawn behind.
    const cast = [
      ...s.enemies.map((e) => ({ y: e.y, draw: () => {
        if (e.down > 0) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, e.down);
          ctx.translate(e.x, e.y);
          ctx.rotate(Math.PI / 2);
          drawBrawler(ctx, 0, 0, 0.92, 1, 0, e.shirt, '#20313d');
          ctx.restore();
          return;
        }
        drawBrawler(
          ctx, e.x, e.y, 0.92, s.px < e.x ? -1 : 1, e.strike, e.shirt, '#20313d', 'none', e.hurt,
        );
      } })),
      // Drawn a size up on the opponents: in a crowd of four the one you are
      // steering has to be findable at a glance, and colour alone was not
      // doing it once two enemies overlapped.
      // Trousers stay the fixed '#2f3a2a' regardless of character — only the
      // shirt is the skinnable part, same as every other game's single body
      // colour; the character's accent has no home here.
      { y: s.py, draw: () => drawBrawler(
        ctx, s.px, s.py, 1.18, s.facing, s.strike, character.body, '#2f3a2a', s.weapon, s.hurt,
      ) },
    ].sort((a, b) => a.y - b.y);
    for (const c of cast) c.draw();

    // ---- hud ---------------------------------------------------------------
    ctx.fillStyle = '#eef2ea';
    ctx.font = '900 34px Archivo, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(s.floored), 16, 42);

    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i < s.hp ? '#ff6a1a' : 'rgba(238,242,234,0.2)';
      ctx.fillRect(16 + i * 15, 52, 11, 6);
    }

    if (s.weapon !== 'none') {
      ctx.font = '700 11px Archivo, system-ui, sans-serif';
      ctx.fillStyle = '#f5c542';
      ctx.fillText(`${s.weapon.toUpperCase()} ×${s.weaponUses}`, 16, 76);
    }

    drawCoin(ctx, width - 74, 32, 12);
    ctx.font = '900 24px Archivo, system-ui, sans-serif';
    ctx.fillStyle = s.flash > 0.05 ? '#4ade80' : s.flash < -0.05 ? '#ff6b6b' : '#eef2ea';
    ctx.fillText(String(s.coins - s.hazards), width - 56, 41);

    ctx.font = '700 11px Archivo, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(238,242,234,0.55)';
    ctx.fillText(
      s.over ? 'TAP TO RESTART' : 'DRAG TO MOVE · TAP TO STRIKE · TAP ON A WEAPON TO LIFT IT',
      16,
      height - 14,
    );
  }

  return (
    <GameCanvas
      running
      onFrame={frame}
      ariaLabel="Alley game board"
      className="h-[62vh] max-h-[520px] w-full rounded-[1.25rem] bg-[#2c2620]"
    />
  );
}
