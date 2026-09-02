'use client';

import { useRef } from 'react';

import { GameCanvas, type Frame } from './GameCanvas';
import { drawBike, drawCoin, drawHazard } from './sprites';

interface Pickup { x: number; y: number; kind: 'coin' | 'hazard'; taken: boolean }

interface State {
  started: boolean; over: boolean;
  /** Distance travelled, in metres. */
  x: number; speed: number;
  /** Height above the terrain, and vertical velocity. */
  y: number; vy: number; airborne: boolean;
  /** Bike pitch in radians, and how fast it is rotating. */
  angle: number; spin: number;
  heat: number; stalled: number;
  wheel: number; pickups: Pickup[]; nextPickup: number;
  coins: number; hazards: number; flash: number;
  crashed: number; message: string; messageAt: number;
}

const START: Omit<State, 'started'> = {
  over: false, x: 0, speed: 9, y: 0, vy: 0, airborne: false,
  angle: 0, spin: 0, heat: 0, stalled: 0, wheel: 0,
  pickups: [], nextPickup: 30, coins: 0, hazards: 0, flash: 0,
  crashed: 0, message: '', messageAt: 0,
};

/** Pixels drawn per metre ridden. */
const PPM = 6;

/** Terrain height at a distance, in pixels above the baseline. */
function ground(x: number): number {
  return (
    Math.sin(x * 0.055) * 26 +
    Math.sin(x * 0.021 + 1.3) * 44 +
    Math.sin(x * 0.11 + 0.7) * 9
  );
}

/**
 * Terrain slope, as the angle it is actually drawn at.
 *
 * The horizontal step has to be converted to pixels before the angle is taken:
 * height is in pixels and distance is in metres, and comparing the two
 * directly reports every hill as roughly six times steeper than it appears —
 * which put the bike permanently past its own landing tolerance and ended
 * every run inside thirty metres.
 */
function slope(x: number): number {
  const d = 0.6;
  return Math.atan2(ground(x + d) - ground(x - d), d * 2 * PPM);
}

/**
 * Overheat — a side-on dirt bike ride over rolling terrain.
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
 */
export function OverheatGame({
  onFinish,
}: {
  onFinish: (score: number, coins: number, hazards: number) => void;
}) {
  const state = useRef<State>({ ...START, started: false });
  const done = useRef(false);

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

  function frame({ ctx, dt, width, height, pointer }: Frame) {
    const s = state.current;
    if (!s.started) reset();

    const baseY = height * 0.66;
    const riderX = width * 0.3;

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
      const terrain = ground(s.x);
      const under = slope(s.x);

      if (!s.airborne) {
        s.y = terrain;
        s.angle += (under - s.angle) * Math.min(1, dt * 14);
        // A crest steeper than the bike can follow launches it.
        const ahead = slope(s.x + 1.6);
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
          y: ground(s.nextPickup) + (air ? 52 + Math.random() * 40 : 12),
          kind: air ? 'coin' : Math.random() < 0.45 ? 'hazard' : 'coin',
          taken: false,
        });
      }

      for (const pickup of s.pickups) {
        if (pickup.taken) continue;
        if (Math.abs(pickup.x - s.x) < 1.6 && Math.abs(pickup.y - s.y) < 26) {
          pickup.taken = true;
          if (pickup.kind === 'coin') { s.coins += 1; s.flash = 1; }
          else { s.hazards += 1; s.flash = -1; s.speed = Math.max(5, s.speed - 5); }
        }
      }
      s.pickups = s.pickups.filter((p) => p.x > s.x - 20);
    }

    s.flash *= Math.max(0, 1 - dt * 2.2);

    // ---- draw --------------------------------------------------------------
    ctx.clearRect(0, 0, width, height);

    const skyTop = s.heat > 0.7 ? '#3a2418' : '#1b2a3a';
    ctx.fillStyle = skyTop;
    ctx.fillRect(0, 0, width, height);

    // Far hills, moving at a fraction of the rider's speed.
    ctx.fillStyle = '#243447';
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let px = 0; px <= width; px += 8) {
      const wx = s.x * 0.25 + px / PPM;
      ctx.lineTo(px, baseY - ground(wx * 0.6) * 0.5 - 60);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // The track itself.
    ctx.fillStyle = '#6b4a2a';
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let px = 0; px <= width; px += 4) {
      const wx = s.x + (px - riderX) / PPM;
      ctx.lineTo(px, baseY - ground(wx));
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#8a6238';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let px = 0; px <= width; px += 4) {
      const wx = s.x + (px - riderX) / PPM;
      const py = baseY - ground(wx);
      if (px === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    for (const pickup of s.pickups) {
      if (pickup.taken) continue;
      const px = riderX + (pickup.x - s.x) * PPM;
      if (px < -30 || px > width + 30) continue;
      const py = baseY - pickup.y;
      if (pickup.kind === 'coin') drawCoin(ctx, px, py, 12, performance.now() / 240 + pickup.x);
      else drawHazard(ctx, px, py, 12);
    }

    drawBike(ctx, riderX, baseY - s.y - 9, 1, -s.angle + (s.crashed ? 1.5 : 0), s.wheel, s.heat);

    // ---- hud ---------------------------------------------------------------
    ctx.fillStyle = '#eef2ea';
    ctx.font = '900 34px Archivo, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.floor(s.x)}m`, 16, 42);

    // Temperature gauge — the thing the player is actually managing.
    const gaugeW = 96;
    ctx.fillStyle = 'rgba(238,242,234,0.2)';
    ctx.fillRect(16, 52, gaugeW, 8);
    const heat = Math.min(1, s.heat);
    ctx.fillStyle = heat > 0.8 ? '#ff6b6b' : heat > 0.55 ? '#f5c542' : '#4ade80';
    ctx.fillRect(16, 52, gaugeW * heat, 8);
    ctx.fillStyle = 'rgba(238,242,234,0.5)';
    ctx.fillRect(16 + gaugeW * 0.8, 50, 2, 12);
    ctx.font = '700 10px Archivo, system-ui, sans-serif';
    ctx.fillText('ENGINE', 16, 74);

    drawCoin(ctx, width - 74, 32, 12);
    ctx.font = '900 24px Archivo, system-ui, sans-serif';
    ctx.fillStyle = s.flash > 0.05 ? '#4ade80' : s.flash < -0.05 ? '#ff6b6b' : '#eef2ea';
    ctx.fillText(String(s.coins - s.hazards), width - 56, 41);

    const age = (performance.now() - s.messageAt) / 1000;
    if (s.message && age < 1.4) {
      ctx.textAlign = 'center';
      ctx.font = '900 26px Archivo, system-ui, sans-serif';
      ctx.fillStyle = s.message === 'DOWN' ? '#ff6b6b' : s.message === 'UNTIDY' ? '#eef2ea' : '#f5c542';
      ctx.fillText(s.message, width / 2, height * 0.28);
    }

    ctx.textAlign = 'left';
    ctx.font = '700 11px Archivo, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(238,242,234,0.55)';
    ctx.fillText(
      s.over ? 'TAP TO RESTART' : s.airborne ? 'LEFT LIFTS THE NOSE · RIGHT DROPS IT' : 'HOLD TO ACCELERATE',
      16,
      height - 14,
    );
  }

  return (
    <GameCanvas
      running
      onFrame={frame}
      ariaLabel="Overheat game board"
      className="h-[62vh] max-h-[520px] w-full rounded-[1.25rem] bg-[#1b2a3a]"
    />
  );
}
