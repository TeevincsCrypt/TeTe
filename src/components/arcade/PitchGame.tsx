'use client';

import { useRef } from 'react';

import { sfxCoin, sfxGoal, sfxHazard } from '@/lib/arcade/sfx';

import { GameCanvas, type Frame } from './GameCanvas';
import { drawBall, drawCoin, drawFootballer, drawHazard } from './sprites';

interface Wall { x: number; y: number; drift: number }
interface Pickup { x: number; y: number; kind: 'coin' | 'hazard'; taken: boolean }

interface State {
  started: boolean; over: boolean;
  /** Ball position and velocity, in pixels and pixels per second. */
  bx: number; by: number; vx: number; vy: number;
  /** Sideways acceleration applied while the ball is travelling — the curl. */
  curl: number; spin: number; live: boolean;
  aiming: boolean; aimX: number; aimY: number;
  wall: Wall[]; keeperX: number; keeperDir: number; keeperSpeed: number;
  pickups: Pickup[];
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
 * Pitch — top-down free kicks where the ball bends hard.
 *
 * An original game in the top-down football genre, built around that genre's
 * signature: heavy curl. Drag back from the ball and let go — the direction
 * sets the aim, the length sets the power, and the sideways component of the
 * drag sets how much the ball bends in flight. A straight shot has no chance
 * against a set wall; the whole game is learning to bend one round it.
 *
 * Ten shots per round. Coins sit on the pitch and are collected by the ball as
 * it travels, which usually means choosing a line that is worse for scoring.
 */
export function PitchGame({
  onFinish,
}: {
  onFinish: (score: number, coins: number, hazards: number) => void;
}) {
  const state = useRef<State>({ ...START, started: false });
  const done = useRef(false);

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

  function frame({ ctx, dt, width, height, pointer }: Frame) {
    const s = state.current;
    if (!s.started) reset(width, height);

    const { goalW, goalX, goalY, keeperY } = layout(width, height);

    if (pointer.pressed && s.over && done.current) {
      reset(width, height);
      return;
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

    function nextShot() {
      if (s.attempts >= SHOTS) finish();
      else setPiece(width, height);
    }

    s.flash *= Math.max(0, 1 - dt * 2.2);

    // ---- draw --------------------------------------------------------------
    ctx.clearRect(0, 0, width, height);

    // Mown stripes, so the pitch reads as a pitch and gives depth cues.
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = i % 2 ? '#2f7d3c' : '#2a7136';
      ctx.fillRect(0, (i * height) / 12, width, height / 12 + 1);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Six-yard box and penalty arc.
    const boxW = Math.min(280, width * 0.8);
    ctx.strokeRect((width - boxW) / 2, 10, boxW, 96);
    ctx.beginPath();
    ctx.arc(width / 2, 106, 52, 0, Math.PI);
    ctx.stroke();

    // Goal frame and net.
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(goalX, goalY - 34, goalW, 34);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i += 1) {
      ctx.beginPath();
      ctx.moveTo(goalX + (i / 10) * goalW, goalY - 34);
      ctx.lineTo(goalX + (i / 10) * goalW, goalY);
      ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(goalX, goalY);
    ctx.lineTo(goalX, goalY - 34);
    ctx.lineTo(goalX + goalW, goalY - 34);
    ctx.lineTo(goalX + goalW, goalY);
    ctx.stroke();

    for (const pickup of s.pickups) {
      if (pickup.taken) continue;
      if (pickup.kind === 'coin') drawCoin(ctx, pickup.x, pickup.y, 12, performance.now() / 240);
      else drawHazard(ctx, pickup.x, pickup.y, 12);
    }

    for (const defender of s.wall) {
      drawFootballer(ctx, defender.x, defender.y, 17, '#e8e4dd', '#20313d');
    }
    drawFootballer(ctx, goalX + s.keeperX * goalW, keeperY, 18, '#f5c542', '#17120e');

    // The aim line, with the predicted bend drawn in — the curl has to be
    // visible before the shot or it is guesswork rather than a skill.
    if (s.aiming) {
      const dx = s.bx - s.aimX;
      const dy = s.by - s.aimY;
      const power = Math.min(1, Math.hypot(dx, dy) / 150);
      const angle = Math.atan2(dy, dx);
      const speed = 250 + power * 520;
      let px = s.bx;
      let py = s.by;
      let pvx = Math.cos(angle) * speed;
      let pvy = Math.sin(angle) * speed;
      const pcurl = (dx / Math.max(40, Math.abs(dy))) * -520;

      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 7]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let i = 0; i < 26; i += 1) {
        pvx += pcurl * 0.035;
        const drag = Math.pow(0.35, 0.035);
        pvx *= drag;
        pvy *= drag;
        px += pvx * 0.035;
        py += pvy * 0.035;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    drawBall(ctx, s.bx, s.by, 9, s.spin);

    // ---- hud ---------------------------------------------------------------
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 34px Archivo, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(s.goals), 16, 42);
    ctx.font = '700 11px Archivo, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`SHOT ${Math.min(s.attempts + 1, SHOTS)} OF ${SHOTS}`, 16, 58);

    drawCoin(ctx, width - 74, 32, 12);
    ctx.font = '900 24px Archivo, system-ui, sans-serif';
    ctx.fillStyle = s.flash > 0.05 ? '#4ade80' : s.flash < -0.05 ? '#ff6b6b' : '#ffffff';
    ctx.fillText(String(s.coins - s.hazards), width - 56, 41);

    const age = (performance.now() - s.messageAt) / 1000;
    if (s.message && age < 1.3) {
      ctx.textAlign = 'center';
      ctx.font = '900 30px Archivo, system-ui, sans-serif';
      ctx.fillStyle = s.message === 'GOAL' ? '#c8ff4d' : 'rgba(255,255,255,0.9)';
      ctx.fillText(s.message, width / 2, height / 2);
    }

    ctx.textAlign = 'left';
    ctx.font = '700 11px Archivo, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(
      s.over ? 'TAP TO PLAY AGAIN' : 'DRAG BACK AND RELEASE · PULL WIDE TO BEND IT',
      16,
      height - 14,
    );
  }

  return (
    <GameCanvas
      running
      onFrame={frame}
      ariaLabel="Pitch game board"
      className="h-[62vh] max-h-[520px] w-full rounded-[1.25rem] bg-[#2a7136]"
    />
  );
}
