'use client';

import { useEffect, useRef } from 'react';

import {
  CAR_Y_OFFSET,
  createDriftScene,
  disposeDriftScene,
  resizeDriftScene,
  setCarColor,
  updateDriftScene,
  type DriftScene,
  type Pickup,
  type Slice,
} from '@/lib/arcade/drift3d';
import { sfxCoin, sfxHazard } from '@/lib/arcade/sfx';
import { useCharacter } from '@/state/use-character';

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
 * scoring as always — none of that changed. What changed is the renderer:
 * this now drives a real lit, fogged Three.js scene (road, car, palm trees,
 * guardrails, ocean, skyline) instead of flat 2D canvas shapes, built and
 * driven directly here rather than through a shared 2D canvas.
 *
 * One deliberate simplification carried over from the 3D scene itself: the
 * road shifts sideways in step with the same `centre` the physics already
 * computes, but the camera stays fixed rather than banking and turning to
 * follow the curve's heading — so the drive feel is unchanged, but the road
 * doesn't curve away in true depth the way a full 3D track would.
 */
export function DriftGame({
  onFinish,
}: {
  onFinish: (score: number, coins: number, hazards: number) => void;
}) {
  const { character } = useCharacter();
  const characterColor = useRef(character.body);
  characterColor.current = character.body;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let scene: DriftScene;
    try {
      scene = createDriftScene(canvas, characterColor.current);
    } catch {
      // No WebGL available — nothing sensible to render; bail out quietly
      // rather than crash the whole arcade page.
      return;
    }

    let raf = 0;
    let last = performance.now();
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      resizeDriftScene(scene, width, height);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const pointer = { down: false, pressed: false };
    const onDown = (event: PointerEvent) => {
      event.preventDefault();
      pointer.down = true;
      pointer.pressed = true;
      canvas.setPointerCapture(event.pointerId);
    };
    const onUp = () => {
      pointer.down = false;
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;

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

      // ---- render -------------------------------------------------------
      setCarColor(scene, characterColor.current, s.over);
      updateDriftScene(scene, s, width, height);

      if (scoreRef.current) scoreRef.current.textContent = String(Math.floor(s.dist));
      if (tallyRef.current) {
        tallyRef.current.textContent = String(s.coins - s.hazards);
        tallyRef.current.style.color = s.flash > 0.05 ? '#15803d' : s.flash < -0.05 ? '#b91c1c' : '#17120e';
      }
      if (hintRef.current) {
        hintRef.current.textContent = s.over ? 'TAP TO RESTART' : 'HOLD TO STEER RIGHT · RELEASE FOR LEFT';
      }

      pointer.pressed = false;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      disposeDriftScene(scene);
    };
    // Mount once — the loop reads live
    // refs for everything that can change (character colour, callbacks).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-[62vh] max-h-[520px] w-full overflow-hidden rounded-[1.25rem] bg-[#bcd3dd]">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Drift game board"
        style={{ touchAction: 'none', display: 'block', width: '100%', height: '100%' }}
      />
      <div className="pointer-events-none absolute inset-0 select-none">
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
            className="text-[1.3rem] font-black leading-none text-[#17120e]"
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
      </div>
    </div>
  );
}
