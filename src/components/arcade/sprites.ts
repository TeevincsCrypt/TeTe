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
  x: number, y: number, scale = 1, hop = 0, body = '#ff6a1a', accent = '#e05a12',
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

  ctx.fillStyle = body;                          // torso
  roundRect(ctx, -9, -8, 18, 14, 5); ctx.fill();

  ctx.fillStyle = accent;                        // arms
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

/* ------------------------------------------------------------------------ *
 *  Invasion
 * ------------------------------------------------------------------------ */

/**
 * An invader. Three ranks, each a different silhouette so the board reads as
 * a formation of distinct things rather than one shape repeated — and so the
 * back rank, worth most, is identifiable before you commit to a column.
 *
 * `wobble` alternates the legs between two poses, which is what makes a
 * marching row look alive without animating anything else.
 */
export function drawInvader(
  ctx: CanvasRenderingContext2D,
  rank: 0 | 1 | 2, x: number, y: number, r: number, wobble: boolean,
) {
  const skin = ['#c8ff4d', '#ff9d2e', '#6d4aff'][rank] ?? '#c8ff4d';
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = skin;
  if (rank === 0) {
    // Squat crab: wide body, two stalks.
    roundRect(ctx, -r, -r * 0.45, r * 2, r * 1.05, r * 0.35); ctx.fill();
    roundRect(ctx, -r * 0.62, -r * 0.95, r * 0.24, r * 0.55, r * 0.1); ctx.fill();
    roundRect(ctx, r * 0.38, -r * 0.95, r * 0.24, r * 0.55, r * 0.1); ctx.fill();
  } else if (rank === 1) {
    // Domed hull with shoulders.
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.86, Math.PI, 0);
    ctx.rect(-r * 0.86, 0, r * 1.72, r * 0.5);
    ctx.fill();
    roundRect(ctx, -r * 1.15, -r * 0.1, r * 0.35, r * 0.5, r * 0.12); ctx.fill();
    roundRect(ctx, r * 0.8, -r * 0.1, r * 0.35, r * 0.5, r * 0.12); ctx.fill();
  } else {
    // Angular gunship: the one worth the most.
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, r * 0.35);
    ctx.lineTo(r * 0.45, r * 0.6);
    ctx.lineTo(-r * 0.45, r * 0.6);
    ctx.lineTo(-r, r * 0.35);
    ctx.closePath();
    ctx.fill();
  }

  // Legs, swapped each march step.
  ctx.fillStyle = skin;
  const spread = wobble ? r * 0.72 : r * 0.42;
  roundRect(ctx, -spread - r * 0.12, r * 0.5, r * 0.24, r * 0.4, r * 0.1); ctx.fill();
  roundRect(ctx, spread - r * 0.12, r * 0.5, r * 0.24, r * 0.4, r * 0.1); ctx.fill();

  ctx.fillStyle = '#17120e';
  ctx.beginPath();
  ctx.arc(-r * 0.32, -r * 0.12, r * 0.15, 0, Math.PI * 2);
  ctx.arc(r * 0.32, -r * 0.12, r * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** The player's cannon: tracked base, angled shoulders, barrel. */
export function drawCannon(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, body = '#ff6a1a', accent = '#e05a12',
) {
  ctx.save();
  ctx.translate(x, y);
  const h = w * 0.62;

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.5, w * 0.55, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2a211b';
  roundRect(ctx, -w / 2, h * 0.08, w, h * 0.38, h * 0.14); ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, h * 0.1);
  ctx.lineTo(-w * 0.24, -h * 0.34);
  ctx.lineTo(w * 0.24, -h * 0.34);
  ctx.lineTo(w * 0.42, h * 0.1);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = accent;
  roundRect(ctx, -w * 0.07, -h * 0.78, w * 0.14, h * 0.5, w * 0.05); ctx.fill();

  ctx.fillStyle = '#20313d';
  roundRect(ctx, -w * 0.16, -h * 0.28, w * 0.32, h * 0.2, w * 0.05); ctx.fill();

  ctx.restore();
}

/* ------------------------------------------------------------------------ *
 *  Rush
 * ------------------------------------------------------------------------ */

/**
 * The runner, seen from behind and drawn to a projected scale.
 *
 * `pose` is 0 while grounded (legs alternating with `stride`), 1 mid-jump
 * (legs tucked) and 2 while rolling (compressed to a ball), so the three
 * states are told apart by silhouette alone at speed.
 */
export function drawRunnerBack(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, scale: number, stride: number, pose: 0 | 1 | 2,
  body = '#ff6a1a', accent = '#e05a12',
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  if (pose === 2) {
    // Rolled: a tucked ball with a hint of the pack still showing.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, -11, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f3a2a';
    ctx.beginPath();
    ctx.arc(0, -11, 13, Math.PI * 0.15, Math.PI * 0.85);
    ctx.fill();
    ctx.restore();
    return;
  }

  const swing = pose === 1 ? 0 : Math.sin(stride) * 7;

  ctx.fillStyle = '#2f3a2a';                       // legs
  roundRect(ctx, -8, -12 + (pose === 1 ? 4 : 0), 6, 14 - (pose === 1 ? 5 : 0) + swing * 0.3, 3);
  ctx.fill();
  roundRect(ctx, 2, -12 + (pose === 1 ? 4 : 0), 6, 14 - (pose === 1 ? 5 : 0) - swing * 0.3, 3);
  ctx.fill();

  ctx.fillStyle = body;                            // torso
  roundRect(ctx, -11, -32, 22, 22, 7); ctx.fill();

  ctx.fillStyle = accent;                          // backpack
  roundRect(ctx, -7, -28, 14, 15, 5); ctx.fill();

  ctx.fillStyle = accent;                          // arms
  roundRect(ctx, -15, -30 - swing * 0.5, 5, 15, 2.5); ctx.fill();
  roundRect(ctx, 10, -30 + swing * 0.5, 5, 15, 2.5); ctx.fill();

  ctx.fillStyle = '#f0c9a4';                       // head
  ctx.beginPath();
  ctx.arc(0, -40, 8.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2b1f16';                       // hair, seen from behind
  ctx.beginPath();
  ctx.arc(0, -41, 8.5, Math.PI * 0.85, Math.PI * 2.15);
  ctx.fill();

  ctx.restore();
}

/* ------------------------------------------------------------------------ *
 *  Pitch
 * ------------------------------------------------------------------------ */

/** A footballer from above: shirt, shorts, boots, and a number on the back. */
export function drawFootballer(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, shirt: string, shorts: string, facing = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.5, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1a1a1a';                       // boots
  roundRect(ctx, -r * 0.5, r * 0.25, r * 0.34, r * 0.5, r * 0.12); ctx.fill();
  roundRect(ctx, r * 0.16, r * 0.25, r * 0.34, r * 0.5, r * 0.12); ctx.fill();

  ctx.fillStyle = shorts;
  roundRect(ctx, -r * 0.56, -r * 0.05, r * 1.12, r * 0.42, r * 0.12); ctx.fill();

  ctx.fillStyle = shirt;                           // shirt and sleeves
  roundRect(ctx, -r * 0.6, -r * 0.72, r * 1.2, r * 0.74, r * 0.2); ctx.fill();
  roundRect(ctx, -r * 0.86, -r * 0.62, r * 0.3, r * 0.42, r * 0.1); ctx.fill();
  roundRect(ctx, r * 0.56, -r * 0.62, r * 0.3, r * 0.42, r * 0.1); ctx.fill();

  ctx.fillStyle = '#f0c9a4';                       // head
  ctx.beginPath();
  ctx.arc(0, -r * 0.82, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b1f16';
  ctx.beginPath();
  ctx.arc(0, -r * 0.86, r * 0.34, Math.PI * 0.9, Math.PI * 2.1);
  ctx.fill();

  ctx.restore();
}

/** The ball: panelled, with a squash that reads as spin at speed. */
export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.9, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(23,18,14,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.stroke();

  ctx.rotate(spin);
  ctx.fillStyle = '#17120e';
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    ctx.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
    ctx.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.19, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.restore();
}

/* ------------------------------------------------------------------------ *
 *  Overheat
 * ------------------------------------------------------------------------ */

/**
 * Rider and bike from the side, rotated to the machine's pitch.
 *
 * The rider leans opposite the frame, which is what makes an airborne bike
 * read as controlled rather than simply rotated.
 */
export function drawBike(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, scale: number, angle: number, wheelSpin: number, hot: number,
  body = '#ff6a1a', accent = '#e05a12',
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  // Wheels
  for (const wx of [-15, 15]) {
    ctx.fillStyle = '#14100d';
    ctx.beginPath();
    ctx.arc(wx, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a4238';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const a = wheelSpin + (i / 3) * Math.PI * 2;
      ctx.moveTo(wx, 0);
      ctx.lineTo(wx + Math.cos(a) * 6.5, Math.sin(a) * 6.5);
    }
    ctx.stroke();
  }

  // Frame, tinted toward red as the engine heats.
  const heat = Math.max(0, Math.min(1, hot));
  ctx.fillStyle = `rgb(${Math.round(255 * (0.6 + heat * 0.4))}, ${Math.round(106 * (1 - heat * 0.6))}, ${Math.round(26 * (1 - heat * 0.8))})`;
  ctx.beginPath();
  ctx.moveTo(-15, -2);
  ctx.lineTo(-4, -11);
  ctx.lineTo(10, -10);
  ctx.lineTo(15, -1);
  ctx.lineTo(4, -4);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#2a211b';                     // forks and bars
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(15, -1); ctx.lineTo(13, -13);
  ctx.moveTo(9, -15); ctx.lineTo(16, -14);
  ctx.stroke();

  // Rider: leaning back over the seat, elbows out.
  ctx.fillStyle = '#2f3a2a';
  roundRect(ctx, -8, -18, 7, 12, 3); ctx.fill();
  ctx.fillStyle = body;
  roundRect(ctx, -9, -27, 14, 12, 4); ctx.fill();
  ctx.fillStyle = accent;
  roundRect(ctx, 3, -25, 11, 4, 2); ctx.fill();
  ctx.fillStyle = '#20313d';                       // helmet
  ctx.beginPath();
  ctx.arc(-1, -31, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9fd3ff';                       // visor
  roundRect(ctx, 0, -33, 6, 4, 1.6); ctx.fill();

  ctx.restore();
}

/* ------------------------------------------------------------------------ *
 *  Alley
 * ------------------------------------------------------------------------ */

/**
 * A brawler from the side. One function draws both the player and the
 * opponents, distinguished by palette, so a crowded screen still reads as one
 * consistent world.
 *
 * `strike` drives the lead arm from guard to full extension; `weapon` adds
 * what they are holding, which is the point of the game.
 */
export function drawBrawler(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, scale: number, facing: 1 | -1,
  strike: number, shirt: string, trousers: string,
  weapon: 'none' | 'pipe' | 'crate' = 'none',
  hurt = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * scale, scale);

  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 15, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (hurt > 0) {
    ctx.globalAlpha = 0.55 + Math.sin(hurt * 40) * 0.45;
  }

  ctx.fillStyle = trousers;                        // legs, braced apart
  roundRect(ctx, -11, -16, 8, 17, 3); ctx.fill();
  roundRect(ctx, 3, -16, 8, 17, 3); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  roundRect(ctx, -12, -2, 10, 4, 2); ctx.fill();
  roundRect(ctx, 2, -2, 10, 4, 2); ctx.fill();

  ctx.fillStyle = shirt;                           // torso
  roundRect(ctx, -10, -34, 20, 20, 6); ctx.fill();

  // Rear arm stays in guard; lead arm extends with the strike.
  ctx.fillStyle = shirt;
  roundRect(ctx, -14, -32, 5, 13, 2.5); ctx.fill();

  const reach = 9 + strike * 15;
  ctx.save();
  ctx.translate(8, -29);
  ctx.rotate(-strike * 0.25);
  ctx.fillStyle = shirt;
  roundRect(ctx, 0, -2.5, reach, 5.5, 2.5); ctx.fill();
  ctx.fillStyle = '#f0c9a4';                       // fist
  ctx.beginPath();
  ctx.arc(reach + 1, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  if (weapon === 'pipe') {
    ctx.fillStyle = '#8d939b';
    roundRect(ctx, reach - 2, -2, 26, 4, 2); ctx.fill();
    ctx.fillStyle = '#6b7078';
    roundRect(ctx, reach + 20, -3.2, 5, 6.4, 1.6); ctx.fill();
  } else if (weapon === 'crate') {
    ctx.fillStyle = '#a5762f';
    roundRect(ctx, reach - 1, -11, 20, 20, 3); ctx.fill();
    ctx.strokeStyle = '#7b5620';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(reach - 1, -1); ctx.lineTo(reach + 19, -1);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#f0c9a4';                       // head
  ctx.beginPath();
  ctx.arc(2, -41, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b1f16';                       // hair
  ctx.beginPath();
  ctx.arc(2, -43, 8, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#17120e';                       // eye, facing the fight
  ctx.beginPath();
  ctx.arc(6, -40, 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** A crate or a length of pipe lying in the street, waiting to be picked up. */
export function drawStreetItem(
  ctx: CanvasRenderingContext2D,
  kind: 'pipe' | 'crate', x: number, y: number,
) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 2, kind === 'crate' ? 15 : 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (kind === 'crate') {
    ctx.fillStyle = '#a5762f';
    roundRect(ctx, -13, -24, 26, 25, 3); ctx.fill();
    ctx.strokeStyle = '#7b5620';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-13, -12); ctx.lineTo(13, -12);
    ctx.moveTo(-13, -24); ctx.lineTo(13, -1);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#8d939b';
    roundRect(ctx, -16, -6, 32, 5, 2.5); ctx.fill();
    ctx.fillStyle = '#6b7078';
    roundRect(ctx, 12, -7.5, 5, 8, 2); ctx.fill();
    roundRect(ctx, -17, -7.5, 5, 8, 2); ctx.fill();
  }

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
