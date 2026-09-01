/**
 * Canvas sprite drawing.
 *
 * Everything is drawn with paths rather than loaded as images: no asset
 * requests, no sprite sheet to ship into a WebView, and it stays sharp at any
 * device pixel ratio. All artwork here is original — the games sit in familiar
 * arcade genres, but nothing is traced from a commercial title.
 */

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A character seen from above: head, shoulders, arms, feet. */
export function drawRunner(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, scale = 1, hop = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Shadow shrinks as the character rises, which sells the hop.
  ctx.globalAlpha = 0.18 - hop * 0.1;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 12, 11 - hop * 3, 4 - hop, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.translate(0, -hop * 10);

  ctx.fillStyle = '#2f3a2a';                     // legs
  roundRect(ctx, -7, 2, 5, 10, 2.5); ctx.fill();
  roundRect(ctx, 2, 2, 5, 10, 2.5); ctx.fill();

  ctx.fillStyle = '#ff6a1a';                     // torso
  roundRect(ctx, -9, -8, 18, 14, 5); ctx.fill();

  ctx.fillStyle = '#e05a12';                     // arms
  roundRect(ctx, -12.5, -6, 4, 10, 2); ctx.fill();
  roundRect(ctx, 8.5, -6, 4, 10, 2); ctx.fill();

  ctx.fillStyle = '#f0c9a4';                     // head
  ctx.beginPath();
  ctx.arc(0, -14, 7.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2b1f16';                     // hair
  ctx.beginPath();
  ctx.arc(0, -16, 7.5, Math.PI, 0);
  ctx.fill();

  ctx.fillStyle = '#17120e';                     // eyes
  ctx.beginPath();
  ctx.arc(-2.6, -13, 1.1, 0, Math.PI * 2);
  ctx.arc(2.6, -13, 1.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** A car from above: body, roof glass, lights, wheels. */
export function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, facingRight: boolean, body: string,
) {
  const h = 24;
  ctx.save();
  ctx.translate(x, y);
  if (!facingRight) ctx.scale(-1, 1);

  ctx.fillStyle = 'rgba(0,0,0,0.16)';            // shadow
  roundRect(ctx, -w / 2 + 2, -h / 2 + 4, w, h, 7); ctx.fill();

  ctx.fillStyle = body;
  roundRect(ctx, -w / 2, -h / 2, w, h, 7); ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.28)';      // roof highlight
  roundRect(ctx, -w / 2 + 5, -h / 2 + 3, w - 10, 6, 3); ctx.fill();

  ctx.fillStyle = '#20313d';                     // windscreen
  roundRect(ctx, w / 2 - w * 0.34, -h / 2 + 4, w * 0.22, h - 8, 3); ctx.fill();

  ctx.fillStyle = '#ffe9a8';                     // headlights
  roundRect(ctx, w / 2 - 4, -h / 2 + 3, 3, 5, 1.5); ctx.fill();
  roundRect(ctx, w / 2 - 4, h / 2 - 8, 3, 5, 1.5); ctx.fill();

  ctx.fillStyle = '#14100d';                     // wheels
  roundRect(ctx, -w / 2 + 5, -h / 2 - 2.5, 9, 4, 2); ctx.fill();
  roundRect(ctx, -w / 2 + 5, h / 2 - 1.5, 9, 4, 2); ctx.fill();
  roundRect(ctx, w / 2 - 15, -h / 2 - 2.5, 9, 4, 2); ctx.fill();
  roundRect(ctx, w / 2 - 15, h / 2 - 1.5, 9, 4, 2); ctx.fill();

  ctx.restore();
}

/** A locomotive, drawn long so it reads differently from a car. */
export function drawTrain(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, facingRight: boolean,
) {
  const h = 26;
  ctx.save();
  ctx.translate(x, y);
  if (!facingRight) ctx.scale(-1, 1);

  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  roundRect(ctx, -w / 2 + 2, -h / 2 + 4, w, h, 5); ctx.fill();

  ctx.fillStyle = '#b8342a';
  roundRect(ctx, -w / 2, -h / 2, w, h, 5); ctx.fill();

  ctx.fillStyle = '#8c2620';                     // cab
  roundRect(ctx, w / 2 - w * 0.3, -h / 2, w * 0.3, h, 5); ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.2)';       // window band
  roundRect(ctx, -w / 2 + 6, -h / 2 + 5, w - 20, 7, 3); ctx.fill();

  ctx.fillStyle = '#3a2a24';                     // undercarriage
  roundRect(ctx, -w / 2 + 4, h / 2 - 3, w - 8, 5, 2); ctx.fill();

  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.arc(w / 2 - 5, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export type FruitKind = 'melon' | 'orange' | 'apple' | 'lime' | 'plum' | 'banana';

/** Fruit with real silhouettes, so each is recognisable mid-flight. */
export function drawFruit(
  ctx: CanvasRenderingContext2D,
  kind: FruitKind, x: number, y: number, r: number, angle: number, sliced: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (sliced) ctx.globalAlpha = 0.4;

  const skin: Record<FruitKind, string> = {
    melon: '#2e7d32', orange: '#f57c1f', apple: '#d32f2f',
    lime: '#7cb342', plum: '#6a3d9a', banana: '#f2c53d',
  };

  if (kind === 'banana') {
    ctx.strokeStyle = skin.banana;
    ctx.lineWidth = r * 0.62;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -r * 0.25, r * 0.95, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.strokeStyle = '#6b4f16';
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.arc(0, -r * 0.25, r * 0.95, Math.PI * 0.8, Math.PI * 0.86);
    ctx.stroke();
  } else {
    ctx.fillStyle = skin[kind];
    ctx.beginPath();
    if (kind === 'apple') {
      // Two lobes and a dimple read as an apple rather than a ball.
      ctx.moveTo(0, -r * 0.55);
      ctx.bezierCurveTo(-r * 1.15, -r * 1.15, -r * 1.15, r * 0.75, 0, r);
      ctx.bezierCurveTo(r * 1.15, r * 0.75, r * 1.15, -r * 1.15, 0, -r * 0.55);
    } else {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
    ctx.fill();

    if (kind === 'melon') {                       // rind stripes
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.42 * Math.abs(i || 0.5), r, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (kind === 'orange') {                      // pitted skin
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.42)';     // specular
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.4, r * 0.24, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (kind !== 'banana') {                        // stalk and leaf
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = Math.max(2, r * 0.11);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.85);
    ctx.lineTo(r * 0.12, -r * 1.2);
    ctx.stroke();
    ctx.fillStyle = '#43a047';
    ctx.beginPath();
    ctx.ellipse(r * 0.36, -r * 1.16, r * 0.28, r * 0.13, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** The hazard in Slice: a fused bomb, unmistakably not fruit. */
export function drawBomb(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, angle: number, sliced: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (sliced) ctx.globalAlpha = 0.4;

  ctx.fillStyle = '#14100d';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3a3430';
  roundRect(ctx, -r * 0.28, -r * 1.22, r * 0.56, r * 0.36, 2);
  ctx.fill();

  ctx.strokeStyle = '#8d6e4a';
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.2);
  ctx.quadraticCurveTo(r * 0.6, -r * 1.7, r * 0.34, -r * 1.95);
  ctx.stroke();

  ctx.fillStyle = '#ff9d2e';
  ctx.beginPath();
  ctx.arc(r * 0.34, -r * 2.05, r * 0.17, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.36, -r * 0.36, r * 0.2, r * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * A NIM coin to pick up. Gold disc, darker rim, and the wordmark's angled
 * bars so it reads as this app's currency rather than generic treasure.
 */
export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bob = 0) {
  ctx.save();
  ctx.translate(x, y + Math.sin(bob) * r * 0.18);

  ctx.fillStyle = '#b8860b';
  ctx.beginPath();
  ctx.arc(0, r * 0.14, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f5c542';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#d9a520';
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2);
  ctx.stroke();

  // Two leaning bars — a stand-in for the Nimiq mark at this size.
  ctx.fillStyle = '#8a6508';
  ctx.save();
  ctx.rotate(-0.42);
  roundRect(ctx, -r * 0.42, -r * 0.4, r * 0.26, r * 0.8, r * 0.12);
  ctx.fill();
  roundRect(ctx, r * 0.14, -r * 0.4, r * 0.26, r * 0.8, r * 0.12);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.36, -r * 0.42, r * 0.24, r * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * A hazard that costs a coin. Deliberately not car-shaped or fruit-shaped —
 * a spiked caltrop reads as "avoid" at a glance and cannot be mistaken for
 * traffic in Crossing or for road furniture in Drift.
 */
export function drawHazard(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(23,18,14,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.86, r * 0.8, r * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#b91c1c';
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const outer = i % 2 === 0 ? r : r * 0.46;
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#7f1d1d';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
