'use client';

import { useEffect, useRef } from 'react';

export interface Pointer {
  x: number;
  y: number;
  /** True while a finger or mouse button is down. */
  down: boolean;
  /** Set on the frame a press begins, cleared after that frame is read. */
  pressed: boolean;
  /** Set on the frame a press ends. */
  released: boolean;
  /** Movement since the previous frame, in CSS pixels. */
  dx: number;
  dy: number;
}

export interface Frame {
  ctx: CanvasRenderingContext2D;
  /** Seconds since the previous frame, clamped so a backgrounded tab cannot
   *  teleport the world on return. */
  dt: number;
  width: number;
  height: number;
  pointer: Pointer;
}

/**
 * The shared game surface: device-pixel-correct sizing, a clamped rAF loop, and
 * unified pointer input.
 *
 * Every game keeps its own state in a ref and mutates it inside `onFrame`, so a
 * running game never triggers a React render — sixty renders a second would be
 * the fastest way to make a WebView feel cheap.
 */
export function GameCanvas({
  running,
  onFrame,
  className,
  ariaLabel,
}: {
  running: boolean;
  onFrame: (frame: Frame) => void;
  className?: string;
  ariaLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;

  const pointer = useRef<Pointer>({
    x: 0, y: 0, down: false, pressed: false, released: false, dx: 0, dy: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      frameRef.current({ ctx, dt, width, height, pointer: pointer.current });
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
    };
    // `running` is read through the frame callback, so the loop itself never
    // needs restarting — it keeps drawing paused states.
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{ touchAction: 'none', display: 'block', width: '100%' }}
      data-running={running}
    />
  );
}
