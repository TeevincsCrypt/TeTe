'use client';

import { useRef } from 'react';

import {
  createInvasionScene,
  disposeInvasionScene,
  updateInvasionScene,
  type InvasionDrop,
  type InvasionInvader,
  type InvasionScene,
  type InvasionShot,
} from '@/lib/arcade/invasion3d';
import { sfxCoin, sfxHazard, sfxHit, sfxShoot } from '@/lib/arcade/sfx';
import { useCharacter } from '@/state/use-character';

import { Game3D, type Frame3D } from './Game3D';

const COLS = 7;
const ROWS = 4;

interface State {
  started: boolean; over: boolean;
  invaders: InvasionInvader[]; shots: InvasionShot[]; drops: InvasionDrop[];
  /** Formation offset, in pixels from its starting column. */
  driftX: number; driftDir: 1 | -1; stepDown: number;
  marchClock: number; wobble: boolean;
  cannonX: number; cooldown: number;
  downed: number; coins: number; hazards: number;
  lives: number; hitFlash: number; wave: number;
  bombClock: number;
}

const START: Omit<State, 'started'> = {
  over: false, invaders: [], shots: [], drops: [],
  driftX: 0, driftDir: 1, stepDown: 0, marchClock: 0, wobble: false,
  cannonX: 0.5, cooldown: 0, downed: 0, coins: 0, hazards: 0,
  lives: 3, hitFlash: 0, wave: 1, bombClock: 1.2,
};

/**
 * Invasion — a fixed shooter whose ranks close in faster the fewer of them
 * are left.
 *
 * An original game in the fixed-shooter genre. The whole tension of that genre
 * comes from one rule: the formation's march interval shortens as it is
 * thinned, so clearing a wave gets harder exactly as it looks more winnable,
 * and the last invader is the fastest thing on the board. That is reproduced
 * here directly rather than by scripting waves.
 *
 * The cannon fires on its own cadence so a phone only has to steer. Coins fall
 * from downed invaders and have to be caught before they land — going for one
 * pulls the cannon out of position, which is where the cost sits. Bombs that
 * connect count as hazards and take a life.
 *
 * The playfield stays the plane it always was; the depth goes into making the
 * things in it solid, and every position still comes from the same pixel-space
 * arithmetic the collisions use.
 */
export function InvasionGame({
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
  const waveRef = useRef<HTMLDivElement | null>(null);
  const tallyRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const livesRef = useRef<HTMLDivElement | null>(null);

  function buildWave() {
    const invaders: InvasionInvader[] = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        invaders.push({
          col,
          row,
          // Back ranks are the tougher-looking ones, and worth reaching.
          rank: (row === 0 ? 2 : row === 1 ? 1 : 0) as 0 | 1 | 2,
          alive: true,
        });
      }
    }
    return invaders;
  }

  function reset() {
    state.current = { ...START, started: true, invaders: buildWave() };
    done.current = false;
  }

  function finish() {
    const s = state.current;
    s.over = true;
    if (!done.current) {
      done.current = true;
      onFinish(s.downed, s.coins, s.hazards);
    }
  }

  function frame({ handle, dt, width, height, pointer }: Frame3D<InvasionScene>) {
    const s = state.current;
    if (!s.started) reset();

    const cellW = Math.min(46, (width - 32) / COLS);
    const cellH = 40;
    const formationW = COLS * cellW;
    const ox = (width - formationW) / 2;
    const topY = 74;
    const groundY = height - 46;
    const invaderR = Math.min(13, cellW * 0.3);

    if (pointer.pressed && s.over && done.current) {
      reset();
      return;
    }

    // ---- input: drag anywhere to steer the cannon -------------------------
    if (pointer.down && !s.over) {
      s.cannonX = Math.max(0.06, Math.min(0.94, pointer.x / width));
    }
    const cannonPx = s.cannonX * width;

    const alive = s.invaders.filter((i) => i.alive);

    if (!s.over) {
      // ---- march ----------------------------------------------------------
      // The interval is the genre's whole difficulty curve: full formation is
      // slow, a lone survivor is frantic. Waves compound it.
      const remaining = alive.length;
      const total = ROWS * COLS;
      const progress = 1 - remaining / total;
      const interval = Math.max(0.06, (0.62 - progress * 0.5) / (1 + (s.wave - 1) * 0.35));

      s.marchClock -= dt;
      if (s.marchClock <= 0) {
        s.marchClock = interval;
        s.wobble = !s.wobble;

        const leftMost = Math.min(...alive.map((i) => i.col), COLS);
        const rightMost = Math.max(...alive.map((i) => i.col), 0);
        const nextX = s.driftX + s.driftDir * cellW * 0.34;
        const leftEdge = ox + leftMost * cellW + nextX;
        const rightEdge = ox + rightMost * cellW + cellW + nextX;

        if (leftEdge < 8 || rightEdge > width - 8) {
          s.driftDir = s.driftDir === 1 ? -1 : 1;
          s.stepDown += 16;
        } else {
          s.driftX = nextX;
        }
      }

      // ---- the cannon fires itself ----------------------------------------
      s.cooldown -= dt;
      if (s.cooldown <= 0) {
        s.cooldown = 0.34;
        s.shots.push({ x: cannonPx, y: groundY - 26, vy: -520, mine: true });
        sfxShoot();
      }

      // ---- invaders drop bombs --------------------------------------------
      s.bombClock -= dt;
      if (s.bombClock <= 0 && alive.length > 0) {
        s.bombClock = 0.5 + Math.random() * (1.5 - Math.min(1.1, progress));
        // Only the lowest invader in a column can shoot, same as the genre.
        const column = alive[Math.floor(Math.random() * alive.length)];
        if (column) {
          const lowest = alive
            .filter((i) => i.col === column.col)
            .reduce((a, b) => (a.row > b.row ? a : b));
          s.shots.push({
            x: ox + lowest.col * cellW + cellW / 2 + s.driftX,
            y: topY + lowest.row * cellH + s.stepDown,
            vy: 200,
            mine: false,
          });
        }
      }

      // ---- shots -----------------------------------------------------------
      for (const shot of s.shots) shot.y += shot.vy * dt;

      for (const shot of s.shots) {
        if (!shot.mine) continue;
        for (const inv of alive) {
          if (!inv.alive) continue;
          const ix = ox + inv.col * cellW + cellW / 2 + s.driftX;
          const iy = topY + inv.row * cellH + s.stepDown;
          if (Math.abs(shot.x - ix) < invaderR + 3 && Math.abs(shot.y - iy) < invaderR + 6) {
            inv.alive = false;
            shot.y = -999;
            s.downed += 1;
            sfxHit();
            // The back ranks are the ones carrying something worth catching.
            const roll = Math.random();
            if (roll < 0.14 + inv.rank * 0.06) {
              s.drops.push({ x: ix, y: iy, kind: roll < 0.04 ? 'hazard' : 'coin' });
            }
            break;
          }
        }
      }

      for (const shot of s.shots) {
        if (shot.mine) continue;
        if (Math.abs(shot.x - cannonPx) < 20 && shot.y > groundY - 30 && shot.y < groundY + 6) {
          shot.y = 9999;
          s.hazards += 1;
          s.lives -= 1;
          s.hitFlash = 1;
          sfxHazard();
          if (s.lives <= 0) finish();
        }
      }

      s.shots = s.shots.filter((shot) => shot.y > -40 && shot.y < height + 40);

      // ---- falling drops ---------------------------------------------------
      for (const drop of s.drops) drop.y += 150 * dt;
      s.drops = s.drops.filter((drop) => {
        if (drop.y > groundY - 24 && Math.abs(drop.x - cannonPx) < 26) {
          if (drop.kind === 'coin') { s.coins += 1; sfxCoin(); }
          else { s.hazards += 1; sfxHazard(); }
          s.hitFlash = drop.kind === 'coin' ? -1 : 1;
          return false;
        }
        return drop.y < height + 30;
      });

      // ---- wave cleared, or they reached the ground ------------------------
      if (alive.length === 0) {
        s.invaders = buildWave();
        s.wave += 1;
        s.driftX = 0;
        s.driftDir = 1;
        s.stepDown = 0;
        s.shots = [];
      } else {
        const lowest = Math.max(...alive.map((i) => i.row));
        if (topY + lowest * cellH + s.stepDown > groundY - 34) finish();
      }
    }

    s.hitFlash *= Math.max(0, 1 - dt * 2.4);

    updateInvasionScene(
      handle,
      { ...s, layout: { ox, cellW, cellH, topY, groundY } },
      width,
      height,
    );

    if (scoreRef.current) scoreRef.current.textContent = String(s.downed);
    if (waveRef.current) waveRef.current.textContent = `WAVE ${s.wave}`;
    if (tallyRef.current) {
      tallyRef.current.textContent = String(s.coins - s.hazards);
      tallyRef.current.style.color =
        s.hitFlash < -0.05 ? '#4ade80' : s.hitFlash > 0.05 ? '#ff6b6b' : '#ffffff';
    }
    if (livesRef.current) {
      const pips = livesRef.current.children;
      for (let i = 0; i < pips.length; i += 1) {
        (pips[i] as HTMLElement).style.opacity = i < s.lives ? '1' : '0.2';
      }
    }
    if (hintRef.current) {
      hintRef.current.textContent = s.over
        ? 'TAP TO RESTART'
        : 'DRAG TO STEER · IT FIRES ITSELF';
    }
  }

  return (
    <Game3D<InvasionScene>
      ariaLabel="Invasion game board"
      className="h-[62vh] max-h-[520px] bg-[#0b1020]"
      setup={(canvas) => createInvasionScene(canvas, skin.current.body, skin.current.accent)}
      onFrame={frame}
      onDispose={disposeInvasionScene}
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
            <div ref={waveRef} className="mt-0.5 text-[0.58rem] font-bold tracking-[0.14em] text-white/60">
              WAVE 1
            </div>
          </div>

          <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5 rounded-lg bg-black/25 px-2.5 py-1.5">
              <span className="size-3 rounded-full bg-[#f2c14e] shadow-[inset_-1px_-1px_2px_rgba(0,0,0,0.35)]" />
              <div
                ref={tallyRef}
                className="text-[1.3rem] font-black leading-none text-white"
                style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
              >
                0
              </div>
            </div>
            {/* Lives drain rightward as they are lost. */}
            <div ref={livesRef} className="flex gap-1 rounded-md bg-black/25 px-2 py-1.5">
              <span className="size-2.5 rounded-full bg-[#ff6a1a]" />
              <span className="size-2.5 rounded-full bg-[#ff6a1a]" />
              <span className="size-2.5 rounded-full bg-[#ff6a1a]" />
            </div>
          </div>

          <div
            ref={hintRef}
            className="absolute bottom-3 left-3 rounded-md bg-black/25 px-2 py-1 text-[0.68rem] font-bold tracking-wide text-white/90"
          >
            DRAG TO STEER · IT FIRES ITSELF
          </div>
        </>
      }
    />
  );
}
