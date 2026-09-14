'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { type Stage, resizeStage } from '@/lib/arcade/three-kit';

import type { Pointer } from './GameCanvas';

export interface Frame3D<H> {
  /** Whatever `setup` built: the game's own world, stage included. */
  handle: H;
  /** Seconds since the previous frame, clamped so a backgrounded tab cannot
   *  teleport the world on return. */
  dt: number;
  /** The game's coordinate space, in CSS pixels — the same numbers the 2D
   *  canvas used, so ported physics needs no rescaling. */
  width: number;
  height: number;
  pointer: Pointer;
}

/**
 * The shared surface for the 3D games: WebGL context, device-pixel-correct
 * sizing, a clamped rAF loop, unified pointer input, and disposal on the way
 * out. The 2D `GameCanvas` equivalent, and deliberately the same `Pointer`
 * shape, so a game's input handling ports across without being rewritten.
 *
 * Like GameCanvas, a running game keeps its state in a ref and mutates it
 * inside `onFrame` — nothing here triggers a React render per frame. HUD text
 * is written straight to DOM nodes for the same reason; see the games' own
 * `hud` blocks.
 *
 * `setup` returning null (no WebGL) leaves the overlay and its fallback in
 * place rather than crashing the arcade.
 */
export function Game3D<H extends { stage: Stage }>({
  setup,
  onFrame,
  onDispose,
  hud,
  className,
  ariaLabel,
}: {
  setup: (canvas: HTMLCanvasElement) => H | null;
  onFrame: (frame: Frame3D<H>) => void;
  onDispose?: (handle: H) => void;
  hud?: ReactNode;
  className?: string;
  ariaLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Read through refs so the loop never restarts: it is set up once, and the
  // callbacks it calls are always the current render's.
  const setupRef = useRef(setup);
  const frameRef = useRef(onFrame);
  const disposeRef = useRef(onDispose);
  setupRef.current = setup;
  frameRef.current = onFrame;
  disposeRef.current = onDispose;

  const pointer = useRef<Pointer>({
    x: 0, y: 0, down: false, pressed: false, released: false, dx: 0, dy: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let handle: H | null = null;
    try {
      handle = setupRef.current(canvas);
    } catch {
      handle = null;
    }
    if (!handle) return;
    const world = handle;

    let raf = 0;
    let last = performance.now();
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      resizeStage(world.stage, width, height);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const local = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onDown = (event: PointerEvent) => {
      event.preventDefault();
      const { x, y } = local(event);
      const p = pointer.current;
      p.x = x; p.y = y; p.down = true; p.pressed = true; p.dx = 0; p.dy = 0;
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      const { x, y } = local(event);
      const p = pointer.current;
      p.dx += x - p.x; p.dy += y - p.y; p.x = x; p.y = y;
    };
    const onUp = () => {
      const p = pointer.current;
      p.down = false; p.released = true;
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      frameRef.current({ handle: world, dt, width, height, pointer: pointer.current });
      world.stage.renderer.render(world.stage.scene, world.stage.camera);
      const p = pointer.current;
      p.pressed = false; p.released = false; p.dx = 0; p.dy = 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      disposeRef.current?.(world);
    };
    // Mount once — everything that can change is read through a ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative w-full overflow-hidden rounded-[1.25rem] ${className ?? 'h-[62vh] max-h-[520px] bg-[#bcd3dd]'}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        style={{ touchAction: 'none', display: 'block', width: '100%', height: '100%' }}
      />
      {hud && <div className="pointer-events-none absolute inset-0 select-none">{hud}</div>}
    </div>
  );
}

/** The HUD chrome every 3D game shares: a score, a tally, and a hint line. */
export function Hud({
  scoreRef,
  tallyRef,
  hintRef,
  hint,
  tallyIcon = 'coin',
}: {
  scoreRef: React.RefObject<HTMLDivElement | null>;
  tallyRef?: React.RefObject<HTMLDivElement | null>;
  hintRef: React.RefObject<HTMLDivElement | null>;
  hint: string;
  tallyIcon?: 'coin' | 'none';
}) {
  return (
    <>
      <div
        ref={scoreRef}
        className="absolute left-3 top-3 rounded-lg bg-black/25 px-2.5 py-1 text-[1.9rem] font-black leading-none text-white drop-shadow"
        style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
      >
        0
      </div>
      {tallyRef && (
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/25 px-2.5 py-1.5">
          {tallyIcon === 'coin' && (
            <span className="size-3 rounded-full bg-[#f2c14e] shadow-[inset_-1px_-1px_2px_rgba(0,0,0,0.35)]" />
          )}
          <div
            ref={tallyRef}
            className="text-[1.3rem] font-black leading-none text-white"
            style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}
          >
            0
          </div>
        </div>
      )}
      <div
        ref={hintRef}
        className="absolute bottom-3 left-3 rounded-md bg-black/25 px-2 py-1 text-[0.68rem] font-bold tracking-wide text-white/90"
      >
        {hint}
      </div>
    </>
  );
}
